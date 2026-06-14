import type { ReachChannel } from "../channel.js";
import { hasCookie, loadCookie } from "../cookie.js";
import { loadQids } from "../twitter.js";
import { refreshQueryIds } from "../twitter-heal.js";

// The X/Twitter channel — native GraphQL (no external tool). Needs a stored
// cookie (auth_token + ct0) and current GraphQL query IDs. check() reports both;
// heal() re-scrapes the query IDs from X's web bundles when X rotates them.
export const twitterChannel: ReachChannel = {
  name: "twitter",
  description: "Search + read X/Twitter (native GraphQL)",
  backends: ["x-graphql (cookie)"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i.test(url),
  async check(env) {
    if (!hasCookie("twitter", env)) {
      return {
        name: "twitter",
        status: "off",
        activeBackend: null,
        detail: "no cookie",
        fix: "export your x.com session via Cookie-Editor → cookie_import channel \"twitter\"",
      };
    }
    const haveQids = Boolean(loadQids(env).SearchTimeline || loadQids(env).Bookmarks);
    return haveQids
      ? { name: "twitter", status: "ok", activeBackend: "x-graphql (cookie)", detail: "cookie + query ids" }
      : { name: "twitter", status: "warn", activeBackend: "x-graphql (cookie)", detail: "no query ids cached", fix: "reach heal twitter" };
  },
  // Self-heal: re-scrape X's current GraphQL query IDs from its web bundles.
  heal: (env) => refreshQueryIds(loadCookie("twitter", env), env),
};
