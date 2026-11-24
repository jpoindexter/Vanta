import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { openWithSession } from "../reach/browser-session.js";
import { extractBrowserCookies } from "../reach/browser-cookies.js";
import { cookieHasName, loadCookie } from "../reach/cookie.js";

const Args = z.object({
  url: z.string().url(),
  browser: z.enum(["brave", "chrome", "edge"]).optional(),
  max: z.number().int().min(1).max(60_000).optional(),
});

const DEFAULT_MAX = 12_000;

export function hasLinkedInSession(cookie: string | null): cookie is string {
  return cookie !== null && cookieHasName(cookie, "li_at");
}

export function looksLikeLinkedInSignIn(text: string): boolean {
  return /new to linkedin|join now|sign in with|email or phone/i.test(text);
}

/** The LinkedIn session: live from the browser store, else a stored cookie. */
function linkedinSession(browser?: "brave" | "chrome" | "edge"): string | null {
  if (browser) {
    const r = extractBrowserCookies({ browser, hostLike: "%linkedin.com" });
    if (r.ok && hasLinkedInSession(r.cookie)) return r.cookie;
  }
  const stored = loadCookie("linkedin");
  return hasLinkedInSession(stored) ? stored : null;
}

export const linkedinReadTool: Tool = {
  schema: {
    name: "linkedin_read",
    description:
      "Read-only access to a LinkedIn page through a complete logged-in browser session. " +
      "LinkedIn may refuse automated access; never use this tool for messages, applications, or profile changes. " +
      "Prefer a LinkedIn data export or approved OAuth when available. Returns visible text only.",
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
    const session = linkedinSession(parsed.data.browser);
    if (!session) {
      return {
        ok: false,
        output:
          "LinkedIn is not authenticated (no li_at session cookie). " +
          "Use a LinkedIn data export or approved OAuth; keep profile edits, messages, and applications manual.",
      };
    }
    const r = await openWithSession(parsed.data.url, session);
    if (!r.ok) return { ok: false, output: `linkedin_read failed: ${r.error}` };
    if (looksLikeLinkedInSignIn(r.text)) {
      return {
        ok: false,
        output:
          "LinkedIn rejected the session and returned sign-in. Vanta will not report this as authenticated. " +
          "Refresh access through an approved path or use a LinkedIn data export.",
      };
    }
    return {
      ok: true,
      output: r.text.slice(0, parsed.data.max ?? DEFAULT_MAX) || "(no visible text — use a LinkedIn data export or approved OAuth)",
    };
  },
};
