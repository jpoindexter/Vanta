import { describe, expect, it } from "vitest";
import { readDesktopTheme, saveDesktopTheme } from "./desktop-theme.js";

describe("Desktop appearance", () => {
  it("starts light for new and invalid preferences", () => {
    for (const value of [null, "", "invalid"]) {
      expect(readDesktopTheme({ getItem: () => value })).toBe("light");
    }
  });

  it("preserves an explicit light or dark choice", () => {
    for (const value of ["light", "dark"] as const) {
      expect(readDesktopTheme({ getItem: () => value })).toBe(value);
    }
  });

  it("does not make a blocked preference store prevent startup", () => {
    expect(readDesktopTheme({ getItem: () => { throw new Error("blocked"); } })).toBe("light");
  });

  it("persists the choice in the existing key, without touching other state", () => {
    const stored = new Map([["unrelated", "keep"]]);
    expect(saveDesktopTheme("dark", { setItem: (key, value) => { stored.set(key, value); } })).toBe(true);
    expect(stored).toEqual(new Map([["unrelated", "keep"], ["vanta.desktop.theme", "dark"]]));
    expect(readDesktopTheme({ getItem: (key) => stored.get(key) ?? null })).toBe("dark");
  });

  it("reports storage failure without losing the ability to change appearance", () => {
    expect(saveDesktopTheme("light", { setItem: () => { throw new Error("quota"); } })).toBe(false);
  });
});
