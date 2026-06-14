import type { ReachChannel } from "../channel.js";

// The RSS/Atom channel — read any feed. Backed by the built-in rss_read tool
// (pure-TS parse, native fetch), so zero-config and always ok. canHandle matches
// common feed URL shapes so resolveChannel routes feed links here over `web`.
const FEED_URL = /\.(rss|atom|xml)(\?|$)|\/(rss|feed|atom)(\/|\.|\?|$)/i;

export const rssChannel: ReachChannel = {
  name: "rss",
  description: "Read RSS/Atom feeds",
  backends: ["rss_read"],
  tier: 0,
  canHandle: (url) => /^https?:\/\//i.test(url) && FEED_URL.test(url),
  async check() {
    return { name: "rss", status: "ok", activeBackend: "rss_read (built-in)", detail: "pure-TS parser" };
  },
};
