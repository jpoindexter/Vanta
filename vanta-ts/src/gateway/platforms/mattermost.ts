import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Mattermost's default MaxPostSize is 16383 characters; a post over that 400s.
const MATTERMOST_LIMIT = 16383;

// Mattermost adapter — Mattermost REST API v4, pure fetch, no SDK.
// poll = GET /api/v4/channels/{channel_id}/posts?since=<unix-ms> → a PostList
//        ({ order: id[], posts: {id: Post} }); we keep the newest create_at as
//        the next `since` cursor. send = POST /api/v4/posts {channel_id, message}.
// Auth = a bot/personal access token as `Authorization: Bearer <token>`.
// chatId IS the channel id (replies post back to the same channel). System posts
// (non-empty type) and the bot's own posts are skipped so it never answers
// itself. Set VANTA_MATTERMOST_URL + VANTA_MATTERMOST_TOKEN + VANTA_MATTERMOST_CHANNEL.
// Offline-tested (parseMattermostPosts is pure); live use needs a real server.

const PostSchema = z.object({
  id: z.string(),
  create_at: z.number(),
  user_id: z.string(),
  channel_id: z.string(),
  message: z.string().optional(),
  type: z.string().optional(),
});

const PostListSchema = z.object({
  order: z.array(z.string()),
  posts: z.record(z.string(), PostSchema),
});

const MeSchema = z.object({ id: z.string() });

export type ParsedPosts = { messages: InboundMessage[]; lastCreateAt: number };

/**
 * Parse a Mattermost PostList into inbound messages + the newest create_at seen
 * (the next `since` cursor). Posts are returned newest-first in `order`; we emit
 * oldest-first. Skips system posts (non-empty type), the bot's own posts
 * (`selfUserId`), empty bodies, and anything at/below the current cursor. Pure.
 */
export function parseMattermostPosts(
  payload: unknown,
  currentCursor: number,
  selfUserId: string,
): ParsedPosts {
  const parsed = PostListSchema.safeParse(payload);
  if (!parsed.success) return { messages: [], lastCreateAt: currentCursor };

  let lastCreateAt = currentCursor;
  const rows: { post: z.infer<typeof PostSchema>; text: string }[] = [];
  for (const id of parsed.data.order) {
    const post = parsed.data.posts[id];
    if (!post) continue;
    lastCreateAt = Math.max(lastCreateAt, post.create_at);
    if (post.create_at <= currentCursor) continue;
    if (post.type && post.type.length > 0) continue;
    if (post.user_id === selfUserId) continue;
    const text = post.message?.trim();
    if (!text) continue;
    rows.push({ post, text });
  }
  rows.sort((a, b) => a.post.create_at - b.post.create_at);
  const messages = rows.map(({ post, text }) => ({
    chatId: post.channel_id,
    text,
    from: post.user_id,
  }));
  return { messages, lastCreateAt };
}

/** Parse the VANTA_MATTERMOST_ALLOW channel-id allowlist (empty = allow all). Pure. */
export function parseChannelAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export class MattermostAdapter implements PlatformAdapter {
  readonly id = "mattermost";
  private cursor = 0;
  private selfUserId = "";
  private readonly api: string;
  private readonly token: string;
  private readonly channel: string;
  private readonly allow: Set<string>;

  constructor(opts: { serverUrl: string; token: string; channel: string; allow?: Set<string> }) {
    this.api = `${opts.serverUrl.replace(/\/+$/, "")}/api/v4`;
    this.token = opts.token;
    this.channel = opts.channel;
    this.allow = opts.allow ?? new Set();
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  async connect(): Promise<void> {
    // Learn the bot's own user id (to skip its own posts) and seed the cursor to
    // "now" so it only answers messages received after start. Best-effort: a
    // failure here just leaves selfUserId empty; poll still degrades cleanly.
    this.cursor = Date.now();
    try {
      const res = await fetch(`${this.api}/users/me`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const me = MeSchema.safeParse(await res.json());
      if (me.success) this.selfUserId = me.data.id;
    } catch {
      /* errors-as-values: stay usable even if the identity probe fails */
    }
  }

  async disconnect(): Promise<void> {
    /* stateless HTTP — nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    try {
      const since = this.cursor ? `?since=${this.cursor}` : "";
      const url = `${this.api}/channels/${encodeURIComponent(this.channel)}/posts${since}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const { messages, lastCreateAt } = parseMattermostPosts(await res.json(), this.cursor, this.selfUserId);
      this.cursor = lastCreateAt;
      return this.allow.size === 0 ? messages : messages.filter((m) => this.allow.has(m.chatId));
    } catch {
      return [];
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    try {
      // Mattermost renders markdown natively, so the dialect is a no-op pass-
      // through — the explicit call documents the per-adapter formatMessage seam.
      const formatted = formatForDialect(msg.text, "markdown");
      for (const part of splitForLimit(formatted, MATTERMOST_LIMIT, "chars")) {
        await fetch(`${this.api}/posts`, {
          method: "POST",
          headers: { ...this.headers(), "content-type": "application/json" },
          body: JSON.stringify({ channel_id: msg.chatId, message: part }),
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch {
      /* errors-as-values: a send failure must not throw through the gateway loop */
    }
  }
}
