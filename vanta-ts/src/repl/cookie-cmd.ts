import { configuredChannels } from "../reach/cookie.js";
import type { SlashHandler } from "./types.js";

// `/cookie` — show which login-walled reach channels have a stored cookie, plus
// the export-and-paste guide. Never prints cookie values.
export const cookie: SlashHandler = (_arg, ctx) => {
  const configured = configuredChannels(ctx.env);
  const status = configured.length ? `Configured: ${configured.join(", ")}` : "Configured: (none yet)";
  const guide = [
    "Give a login-walled channel (reddit, twitter) your browser session — any browser, any OS:",
    "  1. Install the Cookie-Editor (or 'Get cookies.txt LOCALLY') extension — works in Brave/Chrome/Edge/Firefox",
    "  2. Log into the site, Export the cookies (JSON or cookies.txt)",
    "  3. Save the export to a file, then: cookie_import {channel, file:\"~/Downloads/<export>\"}",
    "     (or paste it inline as `cookie` — JSON, cookies.txt, or a header all work)",
    "  Stored 0600 in ~/.vanta, never logged. The extension does the decryption locally,",
    "  so this is portable across browsers/OSes (no fragile per-platform cookie-store reading).",
  ];
  return { output: [status, "", ...guide].join("\n") };
};
