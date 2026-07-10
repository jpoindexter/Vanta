import type { ReachChannel } from "../channel.js";
import { loadCookie } from "../cookie.js";
import { searchTwitter, twitterQueryId } from "../twitter.js";
import { healTwitter } from "../twitter-capture.js";

// The X/Twitter channel uses authenticated GraphQL with native fetch first and
// a browser transport fallback when X's anti-bot edge rejects non-browser TLS.
const BACKEND = "x-graphql (native + browser)";

export const twitterChannel: ReachChannel = {
  name: "twitter",
  description: "Search + read X/Twitter (authenticated GraphQL)",
  backends: [BACKEND],
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
      return { name: "twitter", status: "warn", activeBackend: BACKEND, detail: "no SearchTimeline query id", fix: "reach heal twitter" };
    }
    const probe = await searchTwitter({ query: "from:X", max: 1, latest: true }, cookie, env);
    if (probe.ok) return { name: "twitter", status: "ok", activeBackend: BACKEND, detail: "live search probe passed" };
    const expired = /HTTP (401|403)|cookie expired/i.test(probe.error);
    return {
      name: "twitter",
      status: expired ? "off" : "warn",
      activeBackend: expired ? null : BACKEND,
      detail: `live search probe failed: ${probe.error}`,
      fix: expired ? 're-import x.com auth: cookie_import channel "twitter"' : "reach heal twitter",
    };
  },
  // Self-heal: capture live query IDs via a real browser (browser-session),
  // falling back to the static bundle scrape.
  heal: (env) => healTwitter(env),
};
