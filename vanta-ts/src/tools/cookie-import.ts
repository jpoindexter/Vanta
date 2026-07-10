import { z } from "zod";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Tool } from "./types.js";
import { saveCookie } from "../reach/cookie.js";
import { extractBrowserCookies } from "../reach/browser-cookies.js";

const Args = z.object({
  channel: z.string().min(1),
  cookie: z.string().min(1).optional(),
  file: z.string().min(1).optional(),
  browser: z.enum(["brave", "chrome", "edge"]).optional(),
});

// Channel → cookie host pattern, for reading a logged-in session from the browser.
const CHANNEL_HOST: Record<string, string> = {
  twitter: "%x.com",
  reddit: "%reddit.com",
  xueqiu: "%xueqiu.com",
};

/** The raw cookie text: from the live browser store, a saved `file`, or inline `cookie`. */
function resolveRaw(a: z.infer<typeof Args>): { raw: string } | { error: string } {
  if (a.browser) {
    const hostLike = CHANNEL_HOST[a.channel] ?? `%${a.channel}.com`;
    const r = extractBrowserCookies({ browser: a.browser, hostLike });
    return r.ok ? { raw: r.cookie } : { error: r.error };
  }
  if (a.file) {
    const path = a.file.startsWith("~") ? a.file.replace(/^~/, homedir()) : a.file;
    try {
      return { raw: readFileSync(path, "utf8") };
    } catch (err) {
      return { error: `could not read cookie file ${a.file}: ${(err as Error).message}` };
    }
  }
  return a.cookie ? { raw: a.cookie } : { error: "cookie_import needs a cookie, file, or browser" };
}

export const cookieImportTool: Tool = {
  schema: {
    name: "cookie_import",
    description:
      "Store a browser-exported login cookie for a reach channel (reddit, twitter, …) so its tools can read login-walled content. " +
      "Three sources: `browser:\"brave\"` reads your live logged-in session straight from the browser's cookie store " +
      "(no export — macOS, one Keychain approval); or a Cookie-Editor JSON / Netscape cookies.txt / 'k=v' header pasted as " +
      "`cookie` or read from a saved export via `file`. Stored 0600 in ~/.vanta — local only, never logged or uploaded.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "channel name (e.g. reddit, twitter)" },
        browser: { type: "string", enum: ["brave", "chrome", "edge"], description: "read the live session from this browser's cookie store (macOS)" },
        cookie: { type: "string", description: "the export contents (JSON, cookies.txt, or a header string)" },
        file: { type: "string", description: "path to a saved export file (alternative to cookie; supports ~)" },
      },
      required: ["channel"],
    },
  },
  // Signals credential handling so the kernel gates it (Rule Zero: secret
  // handling needs approval). The cookie value is NEVER placed in this string.
  describeForSafety: (a) => `store a login cookie for ${String(a.channel ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "cookie_import needs a channel + a cookie or file" };
    const src = resolveRaw(parsed.data);
    if ("error" in src) return { ok: false, output: src.error };
    const result = saveCookie(parsed.data.channel, src.raw);
    return result.ok
      ? { ok: true, output: `Stored login cookie for "${parsed.data.channel}" (kept 0600 in ~/.vanta, never logged).` }
      : { ok: false, output: result.error ?? "could not store cookie" };
  },
};
