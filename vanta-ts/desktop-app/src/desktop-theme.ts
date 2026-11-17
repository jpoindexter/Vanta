import { useCallback, useEffect, useState } from "react";
import type { DesktopTheme } from "./types.js";

const THEME_KEY = "vanta.desktop.theme";
const THEME_EVENT = "vanta:appearance";

export function readDesktopTheme(storage: Pick<Storage, "getItem">): DesktopTheme {
  try { return storage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export function saveDesktopTheme(theme: DesktopTheme, storage: Pick<Storage, "setItem">): boolean {
  try { storage.setItem(THEME_KEY, theme); return true; }
  catch { return false; }
}

function currentTheme(): DesktopTheme {
  try { return readDesktopTheme(window.localStorage); }
  catch { return "light"; }
}

function applyTheme(theme: DesktopTheme) {
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.style.colorScheme = theme;
}

export function initializeDesktopTheme() {
  applyTheme(currentTheme());
}

/** One preference and document palette for chat, classic, overlays and companion. */
export function useDesktopTheme(): [DesktopTheme, (theme: DesktopTheme) => void] {
  const [theme, setTheme] = useState<DesktopTheme>(currentTheme);
  useEffect(() => {
    applyTheme(theme);
    const sync = () => setTheme(currentTheme());
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, [theme]);
  const select = useCallback((next: DesktopTheme) => {
    let saved = false;
    try { saved = saveDesktopTheme(next, window.localStorage); } catch { /* Storage can be unavailable. */ }
    setTheme(next);
    applyTheme(next);
    if (saved) window.dispatchEvent(new Event(THEME_EVENT));
    else console.warn("Appearance changed for this window; the preference could not be saved.");
  }, []);
  return [theme, select];
}
