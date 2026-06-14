import type { ReachChannel } from "../channel.js";
import { hasCookie } from "../cookie.js";
import { probeCommand } from "../probe.js";
import { tryUpgrade, pyToolUpgradeCommands } from "../heal.js";

// The X/Twitter channel — search via twitter-cli (keyless cookie auth). Unlike
// reddit, a stored cookie is optional: twitter-cli can auto-extract the session
// from the browser. check() probes the CLI and reports the auth path.
export const twitterChannel: ReachChannel = {
  name: "twitter",
  description: "Search X/Twitter",
  backends: ["twitter-cli"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i.test(url),
  async check(env) {
    const probe = await probeCommand("twitter", ["--help"], env);
    if (!probe.available) {
      return {
        name: "twitter",
        status: "off",
        activeBackend: null,
        detail: "twitter-cli not installed",
        fix: "uv tool install twitter-cli  (or pipx install twitter-cli)",
      };
    }
    const cookie = hasCookie("twitter", env);
    return {
      name: "twitter",
      status: "ok",
      activeBackend: "twitter-cli",
      detail: cookie ? "stored cookie" : "browser session",
    };
  },
  // Self-heal: re-pull twitter-cli (the maintainer tracks X's API churn), so a
  // broken X channel rebuilds itself to the latest working version.
  heal: (env) => tryUpgrade(pyToolUpgradeCommands("twitter-cli"), env),
};
