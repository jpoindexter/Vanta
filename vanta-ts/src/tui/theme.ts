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

const THEMES: Readonly<Record<string, Theme>> = {
  default: {
    primary: "white",
    accent: "cyan",
    border: "cyan",
    dimText: true,
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    marker: "cyan",
    userMarker: "white",
  },
  "high-contrast": {
    primary: "white",
    accent: "yellow",
    border: "white",
    dimText: false,
    success: "greenBright",
    error: "redBright",
    warning: "yellowBright",
    info: "blueBright",
    marker: "yellow",
    userMarker: "white",
  },
  muted: {
    primary: "white",
    accent: "blue",
    border: "gray",
    dimText: true,
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    marker: "blue",
    userMarker: "gray",
  },
  dyslexia: {
    primary: "white",
    accent: "yellow",
    border: "green",
    dimText: false,
    success: "green",
    error: "red",
    warning: "yellow",
    info: "cyan",
    marker: "yellow",
    userMarker: "white",
  },
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
