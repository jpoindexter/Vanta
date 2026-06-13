import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { resolveTheme, resolveThemeByName, type Theme } from "../tui/theme.js";

// Theme for the v2 UI. The 4 canonical themes (default · high-contrast · muted ·
// dyslexia) live in tui/theme.ts; here they flow to the components through a
// context so a /theme switch restyles the live region, composer, footer, and all
// future scrollback at once. Already-committed <Static> rows keep their colours
// (the terminal owns them) — only new output adopts the new theme.

export type { Theme };
export { resolveThemeByName };

const ThemeContext = createContext<Theme>(resolveTheme(process.env));

export function ThemeProvider(props: { theme: Theme; children: ReactNode }): ReactElement {
  return <ThemeContext.Provider value={props.theme}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** dimColor honours the theme's dimText flag — high-contrast/dyslexia keep
 * secondary text readable instead of dimming it. */
export function useDim(): boolean {
  return useTheme().dimText;
}
