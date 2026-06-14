import type { SlashHandler } from "./types.js";
import { THEME_NAMES, currentThemeName } from "../term/theme.js";

// /theme — switch the TUI colour theme live. Returns a `theme` signal the TUI
// host applies to its theme state (status bar + composer restyle immediately;
// the modal pickers pick up the new accent the next time they open). Names are
// the real themes from tui/theme.ts, not a placeholder list.

export const theme: SlashHandler = (arg, ctx) => {
  const active = currentThemeName(ctx.env);
  if (!arg.trim()) {
    const list = THEME_NAMES.map((t) => `  ${t === active ? "›" : " "} ${t}`).join("\n");
    return { output: `Available themes (current: ${active}):\n${list}\n\nUse: /theme <name>` };
  }
  const name = arg.trim().toLowerCase();
  if (!THEME_NAMES.includes(name)) {
    return { output: `  unknown theme '${name}' — use /theme to see available options` };
  }
  if (name === active) return { output: `  already on theme ${name}` };
  return { theme: name, output: `  ✓ theme set to ${name}` };
};
