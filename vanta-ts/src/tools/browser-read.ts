import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { openWithSession, domainOf } from "../reach/browser-session.js";
import { extractBrowserCookies } from "../reach/browser-cookies.js";

const Args = z.object({
  url: z.string().url(),
  browser: z.enum(["brave", "chrome", "edge"]).optional(),
  max: z.number().int().min(1).max(100_000).optional(),
});

const DEFAULT_MAX = 20_000;

/** Pull the logged-in cookies for the url's domain from the browser store, if asked. */
function sessionCookie(url: string, browser?: "brave" | "chrome" | "edge"): string | null {
  if (!browser) return null;
  const host = domainOf(url);
  if (!host) return null;
  const r = extractBrowserCookies({ browser, hostLike: `%${host}` });
  return r.ok ? r.cookie : null;
}

export const browserReadTool: Tool = {
  schema: {
    name: "browser_read",
    description:
      "Read ANY web page through a real headless browser — renders JS and follows your logged-in session. " +
      "Pass browser:\"brave\" to auto-inject your logged-in cookies for the page's domain, so it reads login-walled / " +
      "JS-rendered pages (x.com, reddit, linkedin, internal apps, …) that plain web_fetch can't. Returns the page's visible text. " +
      "Works for every site — not specific to any one platform.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "the absolute URL to read" },
        browser: { type: "string", enum: ["brave", "chrome", "edge"], description: "inject your logged-in session from this browser (macOS)" },
        max: { type: "integer", minimum: 1, maximum: 100000, description: "max characters of text (default 20000)" },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `browser read ${String(a.url ?? "")}`,
  async execute(raw): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'browser_read needs a valid "url"' };
    const { url, browser, max } = parsed.data;
    const r = await openWithSession(url, sessionCookie(url, browser));
    if (!r.ok) return { ok: false, output: `browser_read failed: ${r.error}` };
    const text = r.text.slice(0, max ?? DEFAULT_MAX);
    return { ok: true, output: text || "(page had no visible text)" };
  },
};
