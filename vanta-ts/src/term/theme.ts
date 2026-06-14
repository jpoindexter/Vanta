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
  // the user's washed-out palette.
  // Dark terminal — warm off-white body, muted warm-grey accent (VNT-A: ink on paper)
  default: {
    primary: "#e4e0db",
    accent: "#a09890",
    border: "#5a5550",
    dimText: true,
    success: "#7eb87a",
    error: "#c97070",
    warning: "#c9a860",
    info: "#88afc8",
    marker: "#a09890",
    userMarker: "#787068",
  },
  // Off-white / light-grey terminal (VNT-A aesthetic: dark charcoal on near-white,
  // blueprint-style teal accent hairlines, muted status colours — no pure black/white).
  light: {
    primary: "#1a1a1a",      // near-black for body text
    accent: "#2d6680",       // dark muted teal (annotation lines)
    border: "#888888",       // medium grey hairline (like the circle annotations)
    dimText: true,           // dim → lighter charcoal for secondary content
    success: "#2d7a3a",      // dark forest green
    error: "#8b2222",        // dark crimson
    warning: "#7a6200",      // dark amber
    info: "#2d4a8a",         // dark steel blue
    marker: "#2d6680",       // matches accent — assistant turn mark
    userMarker: "#555555",   // medium charcoal — user turn mark
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
 * Light terminals use the "light" theme (off-white/near-black VNT-A palette).
 * Dark terminals use the "default" truecolor dark palette.
 */
export function detectThemeName(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VANTA_THEME?.toLowerCase();
  if (explicit && THEME_NAMES.includes(explicit)) return explicit;
  if (detectBackground(env) === "light") return "light";
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
