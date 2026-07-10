import type { ReachChannel } from "../channel.js";
import { loadCookie } from "../cookie.js";
import { searchTwitter, twitterQueryId } from "../twitter.js";
import { healTwitter } from "../twitter-capture.js";

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
    const cookie = loadCookie("twitter", env);
    if (!cookie) {
      return {
        name: "twitter",
        status: "off",
        activeBackend: null,
        detail: "no cookie",
        fix: "export your x.com session via Cookie-Editor → cookie_import channel \"twitter\"",
      };
    }
    if (!twitterQueryId("SearchTimeline", env)) {
      return { name: "twitter", status: "warn", activeBackend: "x-graphql (cookie)", detail: "no SearchTimeline query id", fix: "reach heal twitter" };
    }
    const probe = await searchTwitter({ query: "from:X", max: 1, latest: true }, cookie, env);
    if (probe.ok) return { name: "twitter", status: "ok", activeBackend: "x-graphql (cookie)", detail: "live search probe passed" };
    const expired = /HTTP (401|403)|cookie expired/i.test(probe.error);
    return {
      name: "twitter",
      status: expired ? "off" : "warn",
      activeBackend: expired ? null : "x-graphql (cookie)",
      detail: `live search probe failed: ${probe.error}`,
      fix: expired ? 're-import x.com auth: cookie_import channel "twitter"' : "reach heal twitter",
    };
  },
  // Self-heal: capture live query IDs via a real browser (browser-session),
  // falling back to the static bundle scrape.
  heal: (env) => healTwitter(env),
};
