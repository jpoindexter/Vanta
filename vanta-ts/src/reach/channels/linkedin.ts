import type { ReachChannel } from "../channel.js";
import { hasCookie } from "../cookie.js";

// The LinkedIn channel — profiles, companies, posts, search. Login-walled +
// JS-rendered, so it reads through the browser-session capability (linkedin_read
// → openWithSession), using your logged-in session. Not a native API.
export const linkedinChannel: ReachChannel = {
  name: "linkedin",
  description: "Read LinkedIn profiles, companies + posts",
  backends: ["browser-session (linkedin_read)"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/(www\.)?linkedin\.com\//i.test(url),
  async check(env) {
    return hasCookie("linkedin", env)
      ? { name: "linkedin", status: "ok", activeBackend: "linkedin_read (stored cookie)", detail: "authenticated" }
      : {
          name: "linkedin",
          status: "warn",
          activeBackend: "linkedin_read (browser session)",
          detail: "uses your Brave LinkedIn login via linkedin_read browser:brave",
          fix: "log into linkedin.com in Brave (or cookie_import linkedin)",
        };
  },
};
