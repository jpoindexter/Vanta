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

/** Reads VANTA_THEME env var; falls back to "default" for unknown names. */
export function resolveTheme(env: NodeJS.ProcessEnv = process.env): Theme {
  const name = (env.VANTA_THEME ?? "default").toLowerCase();
  return THEMES[name] ?? THEMES.default!;
}

export type { Theme as ArgoTheme };
