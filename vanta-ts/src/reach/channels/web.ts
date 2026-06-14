import type { ReachChannel } from "../channel.js";

// The web channel — reading any URL as clean readable text. Backed by Vanta's
// built-in web_fetch (Readability), which is always available (native fetch),
// so this channel is zero-config and always ok.
export const webChannel: ReachChannel = {
  name: "web",
  description: "Read any web page as clean text",
  backends: ["web_fetch"],
  tier: 0,
  canHandle: (url) => /^https?:\/\//i.test(url),
  async check() {
    return {
      name: "web",
      status: "ok",
      activeBackend: "web_fetch (Readability)",
      detail: "built-in",
    };
  },
};
