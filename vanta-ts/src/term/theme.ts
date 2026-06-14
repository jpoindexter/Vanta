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
  // Truecolor hex (not ANSI names) so the render is identical across terminals
  // and matches the design reference (docs/agent-model.html) instead of inheriting
  // the user's washed-out palette. Light terminals still fall back to high-contrast.
  default: {
    primary: "#c9d4e0",
    accent: "#56c8db",
    border: "#2f8f9e",
    dimText: true,
    success: "#7ec76b",
    error: "#e06c75",
    warning: "#e0b341",
    info: "#6cb6ff",
    marker: "#56c8db",
    userMarker: "#c9d4e0",
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

/**
 * Detect terminal background brightness from COLORFGBG env var.
 * Format: "fg;bg" where bg is an ANSI palette index (0-15).
 * 0-6 and 8 = dark backgrounds; 7 and 9-15 = light backgrounds.
 * Returns "unknown" when absent or unparseable — no escape-sequence queries.
 */
export function detectBackground(
  env: NodeJS.ProcessEnv = process.env,
): "light" | "dark" | "unknown" {
  const raw = env.COLORFGBG;
  if (!raw) return "unknown";
  const parts = raw.split(";");
  const bgStr = parts[parts.length - 1];
  const bg = parseInt(bgStr ?? "", 10);
  if (!Number.isFinite(bg) || bg < 0 || bg > 15) return "unknown";
  // ANSI 7 and 9-15 are light; 0-6 and 8 are dark.
  const isLight = bg === 7 || bg >= 9;
  return isLight ? "light" : "dark";
}

/**
 * Resolve the best theme name given the environment.
 * Precedence: explicit VANTA_THEME (validated) → light-bg fallback → "default".
 * Note: all current themes are dark-oriented; for light terminals we use
 * "high-contrast" (most legible on light BG) — a dedicated light theme is future work.
 */
export function detectThemeName(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VANTA_THEME?.toLowerCase();
  if (explicit && THEME_NAMES.includes(explicit)) return explicit;
  if (detectBackground(env) === "light") return "high-contrast";
  return "default";
}

/** The active theme NAME from env, validated to a known name (else "default"). */
export function currentThemeName(env: NodeJS.ProcessEnv = process.env): string {
  const name = (env.VANTA_THEME ?? "default").toLowerCase();
  return THEME_NAMES.includes(name) ? name : "default";
}

/** Reads VANTA_THEME env var; if unset, detects terminal background and picks accordingly. */
export function resolveTheme(env: NodeJS.ProcessEnv = process.env): Theme {
  return resolveThemeByName(detectThemeName(env));
}

export type { Theme as VantaTheme };
