import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// ntfy's default message-size-limit is 4096 bytes; a larger body is rejected
// or truncated server-side, so the budget is measured in UTF-8 bytes.
const NTFY_BYTE_LIMIT = 4096;

// ntfy adapter — a simple pub/sub notification service. Pure fetch, no SDK.
// poll  = GET /<topic>/json?poll=1[&since=<lastId>] → newline-delimited JSON,
//         one object per line; only event:"message" lines carry user text
//         (open/keepalive/poll_request/*_delete are control frames, skipped).
// send  = POST /<topic> with the raw text body.
// Topic-scoped: ntfy has no per-sender id, so chatId IS the topic (replies
// publish back to the same topic) and `since=<lastId>` is the dedup cursor.
// Set VANTA_NTFY_TOPIC; VANTA_NTFY_SERVER defaults to https://ntfy.sh. Offline-
// tested (parseNtfyMessages is pure); live use needs a real ntfy topic.

export const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

const NtfyMessage = z.object({
  id: z.string(),
  event: z.string(),
  topic: z.string(),
  message: z.string().optional(),
  title: z.string().optional(),
});

export type ParsedNtfy = { messages: InboundMessage[]; lastId: string };

// A successful publish (POST /<topic>) echoes back the created message, whose
// id is the sent message's id.
const NtfySendResponse = z.object({ id: z.string() });

/**
 * Parse an ntfy `?poll=1` body (newline-delimited JSON) into inbound messages +
 * the last seen message id (the next poll cursor). Skips non-message events and
 * malformed lines. The title, when present, prefixes the body. Pure.
 * Each message carries its ntfy `id`; ntfy is topic-based pub/sub with no
 * threading, so isGroup and replyToId are not provided by the platform.
 */
export function parseNtfyMessages(body: string, currentLastId: string): ParsedNtfy {
  const messages: InboundMessage[] = [];
  let lastId = currentLastId;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = NtfyMessage.safeParse(json);
    if (!parsed.success) continue;
    lastId = parsed.data.id;
    if (parsed.data.event !== "message") continue;
    const text = parsed.data.title ? `${parsed.data.title}: ${parsed.data.message ?? ""}` : parsed.data.message;
    if (!text?.trim()) continue;
    messages.push({ chatId: parsed.data.topic, text, from: parsed.data.topic, id: parsed.data.id });
  }
  return { messages, lastId };
}

/**
 * Pure: extract the published message's id from a POST /<topic> response, or
 * undefined when the body is malformed. Keys the outbound message id.
 */
export function parseNtfySentId(payload: unknown): string | undefined {
  const parsed = NtfySendResponse.safeParse(payload);
  return parsed.success ? parsed.data.id : undefined;
}

/** Parse the VANTA_NTFY_ALLOW topic allowlist (empty = allow all). Pure. */
export function parseTopicAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export class NtfyAdapter implements PlatformAdapter {
  readonly id = "ntfy";
  private lastId = "";
  private readonly topic: string;
  private readonly server: string;
  private readonly allow: Set<string>;

  constructor(opts: { topic: string; server?: string; allow?: Set<string> }) {
    this.topic = opts.topic;
    this.server = (opts.server ?? DEFAULT_NTFY_SERVER).replace(/\/+$/, "");
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless HTTP — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    try {
      const since = this.lastId ? `&since=${encodeURIComponent(this.lastId)}` : "";
      const url = `${this.server}/${encodeURIComponent(this.topic)}/json?poll=1${since}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const { messages, lastId } = parseNtfyMessages(await res.text(), this.lastId);
      this.lastId = lastId;
      return this.allow.size === 0 ? messages : messages.filter((m) => this.allow.has(m.chatId));
    } catch {
      return [];
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    try {
      // ntfy delivers a raw text body — strip markdown to readable prose (code
      // spans survive) BEFORE splitting so `**`/``` never reach the notification.
      const formatted = formatForDialect(msg.text, "plain");
      for (const part of splitForLimit(formatted, NTFY_BYTE_LIMIT, "bytes")) {
        const res = await fetch(`${this.server}/${encodeURIComponent(msg.chatId)}`, {
          method: "POST",
          body: part,
          signal: AbortSignal.timeout(5000),
        });
        // Record the FIRST part's published-message id as the outbound id; a
        // split message's head is the stable key.
        if (msg.id === undefined && res.ok) {
          msg.id = parseNtfySentId(await res.json().catch(() => undefined));
        }
      }
    } catch {
      /* errors-as-values: a send failure must not throw through the gateway loop */
    }
  }
}
