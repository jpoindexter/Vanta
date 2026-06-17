// Single fixed palette — terminal-native colors (white for active, gray for
// structure). Glyphs carry semantics, not color. The multi-theme selection +
// terminal-background detection were removed (unused); the UI still depends on
// the token structure via ThemeProvider/useTheme, so colors stay swappable in
// ONE place here rather than hardcoded across components.

export type Theme = {
  primary: string;
  accent: string;
  border: string;
  dimText: boolean;
  /** ✔ success / ready-chip background. */
  success: string;
  /** ✘ error / blocked indicator. */
  error: string;
  /** ⚠ ask / approval-needed indicator. */
  warning: string;
  /** info, URLs, file paths. */
  info: string;
  /** ⏺ assistant-turn marker colour. */
  marker: string;
  /** ❯ user-turn marker colour. */
  userMarker: string;
};

/** The one Vanta palette. */
export const THEME: Theme = {
  primary: "white",
  accent: "white",
  border: "gray",
  dimText: true,
  success: "white",
  error: "white",
  warning: "white",
  info: "gray",
  marker: "white",
  userMarker: "gray",
};

/** Resolve the active theme. Single palette — kept as a fn for call-site stability. */
export function resolveTheme(): Theme {
  return THEME;
}

export type { Theme as VantaTheme };
