import type { ReachChannel } from "../channel.js";

export const v2exChannel: ReachChannel = {
  name: "v2ex",
  description: "Read V2EX hot topics, node topics, topic replies, and member profiles",
  backends: ["v2ex-public-json"],
  tier: 0,
  canHandle: (url) => /^https?:\/\/(www\.)?v2ex\.com\//i.test(url),
  async check() {
    return {
      name: "v2ex",
      status: "ok",
      activeBackend: "v2ex-public-json",
      detail: "zero-config public JSON API",
    };
  },
};
