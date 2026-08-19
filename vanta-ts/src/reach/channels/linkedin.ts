import type { ReachChannel } from "../channel.js";
import { cookieHasName, loadCookie } from "../cookie.js";

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
    const cookie = loadCookie("linkedin", env);
    return cookie && cookieHasName(cookie, "li_at")
      ? {
          name: "linkedin",
          status: "ok",
          activeBackend: "linkedin_read (stored cookie)",
          detail: "session credential present; acceptance is verified on use",
        }
      : {
          name: "linkedin",
          status: "warn",
          activeBackend: "manual export / approved OAuth",
          detail: cookie ? "stored cookies are present but not authenticated (missing li_at)" : "not authenticated",
          fix: "use a LinkedIn data export or approved OAuth; keep profile edits, messages, and applications manual",
        };
  },
};
