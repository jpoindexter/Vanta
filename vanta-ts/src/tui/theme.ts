export type Theme = {
  primary: string;
  accent: string;
  border: string;
  dimText: boolean;
};

const THEMES: Readonly<Record<string, Theme>> = {
  default: { primary: "cyan", accent: "cyan", border: "cyan", dimText: true },
  "high-contrast": { primary: "white", accent: "yellow", border: "white", dimText: false },
  muted: { primary: "blue", accent: "blue", border: "gray", dimText: true },
  dyslexia: { primary: "green", accent: "yellow", border: "green", dimText: false },
};

/** The selectable theme names, in declaration order — drives `/theme` listing. */
export const THEME_NAMES: readonly string[] = Object.keys(THEMES);

/** Resolve a theme by name; falls back to "default" for unknown names. */
export function resolveThemeByName(name: string): Theme {
  return THEMES[name.toLowerCase()] ?? THEMES.default!;
}

/** The active theme NAME from env, validated to a known name (else "default"). */
export function currentThemeName(env: NodeJS.ProcessEnv = process.env): string {
  const name = (env.VANTA_THEME ?? "default").toLowerCase();
  return THEME_NAMES.includes(name) ? name : "default";
}

/** Reads VANTA_THEME env var; falls back to "default" for unknown names. */
export function resolveTheme(env: NodeJS.ProcessEnv = process.env): Theme {
  return resolveThemeByName(env.VANTA_THEME ?? "default");
}

export type { Theme as VantaTheme };
