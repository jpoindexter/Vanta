import { z } from "zod";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Tool } from "./types.js";
import { saveCookie } from "../reach/cookie.js";

const Args = z.object({
  channel: z.string().min(1),
  cookie: z.string().min(1).optional(),
  file: z.string().min(1).optional(),
});

/** The raw cookie text: from `file` (a saved browser export) or inline `cookie`. */
function resolveRaw(a: z.infer<typeof Args>): { raw: string } | { error: string } {
  if (a.file) {
    const path = a.file.startsWith("~") ? a.file.replace(/^~/, homedir()) : a.file;
    try {
      return { raw: readFileSync(path, "utf8") };
    } catch (err) {
      return { error: `could not read cookie file ${a.file}: ${(err as Error).message}` };
    }
  }
  return a.cookie ? { raw: a.cookie } : { error: "cookie_import needs a cookie or a file path" };
}

export const cookieImportTool: Tool = {
  schema: {
    name: "cookie_import",
    description:
      "Store a browser-exported login cookie for a reach channel (reddit, twitter, …) so its tools can read login-walled content. " +
      "Works with any browser/OS: accepts a Cookie-Editor JSON export, a Netscape cookies.txt, or a 'k=v; k2=v2' header — " +
      "pasted as `cookie` or read from a saved export via `file` (preferred: no secret in chat). " +
      "Stored 0600 in ~/.vanta — local only, never logged or uploaded.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "channel name (e.g. reddit, twitter)" },
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
