import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";

// MSG-MULTICHANNEL-LIVE — run 5+ messaging channels from ONE gateway. A composite
// PlatformAdapter that fans `poll` across every configured child adapter (one
// channel failing never breaks the others) and routes each reply back to the
// channel its message came from, via a platform-tagged chatId "<platform>:<chatId>".
// Drop-in: the gateway sees a single PlatformAdapter and is unchanged.

export const ROUTE_SEP = ":";

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
  private readonly children: Map<string, PlatformAdapter>;

  constructor(adapters: PlatformAdapter[]) {
    this.children = new Map(adapters.map((a) => [a.id, a]));
  }

  /** The child platform ids this composite fans out to. */
  channelIds(): string[] {
    return [...this.children.keys()];
  }

  async connect(): Promise<void> {
    for (const c of this.children.values()) await c.connect().catch(() => {});
  }

  async disconnect(): Promise<void> {
    for (const c of this.children.values()) await c.disconnect().catch(() => {});
  }

  /** Poll every channel; a failing channel yields no messages but never throws. */
  async poll(): Promise<InboundMessage[]> {
    const all: InboundMessage[] = [];
    for (const [id, child] of this.children) {
      const msgs = await child.poll().catch(() => [] as InboundMessage[]);
      for (const m of msgs) all.push({ ...m, chatId: tagRoute(id, m.chatId) });
    }
    return all;
  }

  /** Route a reply back to the channel its tagged chatId names. Unknown route → drop. */
  async send(msg: OutboundMessage): Promise<void> {
    const { platform, chatId } = splitRoute(msg.chatId);
    const child = this.children.get(platform);
    if (!child) return; // errors-as-values: an unroutable reply is dropped, never thrown
    await child.send({ ...msg, chatId }).catch(() => {});
  }
}
