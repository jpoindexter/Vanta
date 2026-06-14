import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { openWithSession } from "../reach/browser-session.js";
import { extractBrowserCookies } from "../reach/browser-cookies.js";
import { loadCookie } from "../reach/cookie.js";

const Args = z.object({
  url: z.string().url(),
  browser: z.enum(["brave", "chrome", "edge"]).optional(),
  max: z.number().int().min(1).max(60_000).optional(),
});

const DEFAULT_MAX = 12_000;

/** The LinkedIn session: live from the browser store, else a stored cookie. */
function linkedinSession(browser?: "brave" | "chrome" | "edge"): string | null {
  if (browser) {
    const r = extractBrowserCookies({ browser, hostLike: "%linkedin.com" });
    if (r.ok) return r.cookie;
  }
  return loadCookie("linkedin");
}

export const linkedinReadTool: Tool = {
  schema: {
    name: "linkedin_read",
    description:
      "Read a LinkedIn profile, company, post, or search-results page (login-walled + JS-rendered) through a real browser " +
      "using your logged-in session. Pass browser:\"brave\" to auto-use your LinkedIn login, or cookie_import a linkedin cookie first. " +
      "Returns the page's visible text. (Built on the browser-session reach capability.)",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "a linkedin.com URL (profile, company, post, or search)" },
        browser: { type: "string", enum: ["brave", "chrome", "edge"], description: "auto-use your logged-in session from this browser (macOS)" },
        max: { type: "integer", minimum: 1, maximum: 60000, description: "max characters of text (default 12000)" },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `linkedin read ${String(a.url ?? "")}`,
  async execute(raw): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'linkedin_read needs a valid "url"' };
    if (!/^https?:\/\/(www\.)?linkedin\.com\//i.test(parsed.data.url)) {
      return { ok: false, output: "linkedin_read is for linkedin.com URLs — use browser_read for other sites" };
    }
    const r = await openWithSession(parsed.data.url, linkedinSession(parsed.data.browser));
    if (!r.ok) return { ok: false, output: `linkedin_read failed: ${r.error}` };
    return { ok: true, output: r.text.slice(0, parsed.data.max ?? DEFAULT_MAX) || "(no visible text — log into LinkedIn in your browser, or cookie_import linkedin)" };
  },
};
