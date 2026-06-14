import { z } from "zod";
import type { Tool } from "./types.js";
import { saveCookie } from "../reach/cookie.js";

const Args = z.object({
  channel: z.string().min(1),
  cookie: z.string().min(1),
});

export const cookieImportTool: Tool = {
  schema: {
    name: "cookie_import",
    description:
      "Store a browser-exported login cookie for a reach channel (reddit, twitter, …) so its tools can read login-walled content. " +
      "Accepts a Cookie-Editor JSON export or a 'k=v; k2=v2' header. Stored 0600 in ~/.vanta — local only, never logged or uploaded.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "channel name (e.g. reddit, twitter)" },
        cookie: { type: "string", description: "Cookie-Editor JSON export or a cookie header string" },
      },
      required: ["channel", "cookie"],
    },
  },
  // Signals credential handling so the kernel gates it (Rule Zero: secret
  // handling needs approval). The cookie value is NEVER placed in this string.
  describeForSafety: (a) => `store a login cookie for ${String(a.channel ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "cookie_import needs channel + cookie" };
    const { channel, cookie } = parsed.data;
    const result = saveCookie(channel, cookie);
    return result.ok
      ? { ok: true, output: `Stored login cookie for "${channel}" (kept 0600 in ~/.vanta, never logged).` }
      : { ok: false, output: result.error ?? "could not store cookie" };
  },
};
