import type { ReachChannel } from "../channel.js";
import { hasCookie } from "../cookie.js";

// The Reddit channel — search + read posts/comments. Reddit blocks anonymous
// access, so the backend is Reddit's own .json API authenticated with a stored
// cookie (no external CLI needed). rdt-cli is the documented fallback (not wired
// — would shell out). check() reports cookie status + the exact fix.
export const redditChannel: ReachChannel = {
  name: "reddit",
  description: "Search + read Reddit posts and comments",
  backends: ["reddit.json+cookie", "rdt-cli"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/(www\.)?reddit\.com\//i.test(url),
  async check(env) {
    return hasCookie("reddit", env)
      ? { name: "reddit", status: "ok", activeBackend: "reddit.json (cookie)", detail: "authenticated" }
      : {
          name: "reddit",
          status: "off",
          activeBackend: null,
          detail: "no cookie (anonymous access blocked)",
          fix: "export reddit.com session via Cookie-Editor → cookie_import (see /cookie)",
        };
  },
};
