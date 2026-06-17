import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { resolveTheme, type Theme } from "../term/theme.js";

// The single palette (term/theme.ts) flows to components through a context so
// colours live in one place rather than hardcoded across the UI.

export type { Theme };

const ThemeContext = createContext<Theme>(resolveTheme());

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
