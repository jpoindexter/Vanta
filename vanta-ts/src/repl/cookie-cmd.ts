import { configuredChannels } from "../reach/cookie.js";
import type { SlashHandler } from "./types.js";

// `/cookie` — show which login-walled reach channels have a stored cookie, plus
// the export-and-paste guide. Never prints cookie values.
export const cookie: SlashHandler = (_arg, ctx) => {
  const configured = configuredChannels(ctx.env);
  const status = configured.length ? `Configured: ${configured.join(", ")}` : "Configured: (none yet)";
  const guide = [
    "Give a login-walled channel (reddit, twitter) your browser session:",
    "  1. Install the Cookie-Editor browser extension",
    "  2. Log into the site, open Cookie-Editor → Export → JSON",
    "  3. Paste it to Vanta — it calls cookie_import (kept 0600 in ~/.vanta, never logged)",
  ];
  return { output: [status, "", ...guide].join("\n") };
};
