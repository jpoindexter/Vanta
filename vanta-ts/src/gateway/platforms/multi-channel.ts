import type { InboundMessage, OutboundMessage, PlatformAdapter, PlatformWebhookHandler } from "./base.js";
import { SupervisedChannel, type ChannelHealth } from "./channel-supervisor.js";

// MSG-MULTICHANNEL-LIVE — run 5+ messaging channels from ONE gateway. A composite
// PlatformAdapter that fans `poll` across every configured child adapter (one
// channel failing never breaks the others) and routes each reply back to the
// channel its message came from, via a platform-tagged chatId "<platform>:<chatId>".
// Drop-in: the gateway sees a single PlatformAdapter and is unchanged.
//
// GATEWAY-CHANNEL-SELFHEAL — each child is wrapped in a SupervisedChannel, so a
// dropped channel auto-reconnects with backoff and `health()` exposes per-channel
// status + last reconnect for the gateway to report.

export const ROUTE_SEP = ":";

/** Optional supervision hooks: an injectable clock + a health-change callback. */
export type MultiChannelOpts = {
  now?: () => number;
  onHealthChange?: (h: ChannelHealth) => void;
};

/** Tag a child chatId with its platform so a reply can route back. Pure. */
export function tagRoute(platform: string, chatId: string): string {
  return `${platform}${ROUTE_SEP}${chatId}`;
}

/** Split a tagged chatId into {platform, chatId}. Untagged → platform "". Pure. */
export function splitRoute(tagged: string): { platform: string; chatId: string } {
  const i = tagged.indexOf(ROUTE_SEP);
  if (i < 0) return { platform: "", chatId: tagged };
  return { platform: tagged.slice(0, i), chatId: tagged.slice(i + 1) };
}

export class MultiChannelAdapter implements PlatformAdapter {
  readonly id = "multi";
  private readonly children: Map<string, SupervisedChannel>;

  constructor(adapters: PlatformAdapter[], opts: MultiChannelOpts = {}) {
    this.children = new Map(
      adapters.map((a) => [a.id, new SupervisedChannel(a, opts.now, opts.onHealthChange)]),
    );
  }

  /** The child platform ids this composite fans out to. */
  channelIds(): string[] {
    return [...this.children.keys()];
  }

  /** GATEWAY-CHANNEL-SELFHEAL — per-channel self-heal health snapshot. */
  health(): ChannelHealth[] {
    return [...this.children.values()].map((c) => c.health());
  }

  webhookHandlers(): PlatformWebhookHandler[] {
    return [...this.children.values()].flatMap((child) => child.webhookHandlers());
  }

  async connect(): Promise<void> {
    for (const c of this.children.values()) await c.connect();
  }

  async disconnect(): Promise<void> {
    for (const c of this.children.values()) await c.disconnect();
  }

  /** Poll every channel; a failing channel yields no messages but never throws. */
  async poll(): Promise<InboundMessage[]> {
    const all: InboundMessage[] = [];
    for (const [id, child] of this.children) {
      const msgs = await child.poll();
      for (const m of msgs) all.push({ ...m, chatId: tagRoute(id, m.chatId) });
    }
    return all;
  }

  /** Route a reply back to the channel its tagged chatId names. Unknown route → drop. */
  async send(msg: OutboundMessage): Promise<void> {
    const { platform, chatId } = splitRoute(msg.chatId);
    const child = this.children.get(platform);
    if (!child) return; // errors-as-values: an unroutable reply is dropped, never thrown
    await child.send({ ...msg, chatId });
  }
}
