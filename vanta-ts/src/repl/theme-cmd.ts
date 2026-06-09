import type { SlashHandler } from "./types.js";

const AVAILABLE_THEMES = ["dark", "light", "solarized-dark", "solarized-light", "high-contrast"];

export const theme: SlashHandler = (arg, ctx) => {
  if (!arg.trim()) {
    const list = AVAILABLE_THEMES.map((t) => `  ${t}`).join("\n");
    return {
      output: `Available themes:\n${list}\n\nUse: /theme <name>`,
    };
  }

  const themeName = arg.trim().toLowerCase();
  if (!AVAILABLE_THEMES.includes(themeName)) {
    return {
      output: `  unknown theme '${themeName}' — use /theme to see available options`,
    };
  }

  ctx.state.theme = themeName;
  return { output: `  theme set to ${themeName}` };
};
