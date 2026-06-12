import { describe, it, expect } from "vitest";
import { resolveTheme, resolveThemeByName, currentThemeName, THEME_NAMES } from "./theme.js";

describe("resolveTheme", () => {
  it("returns default theme when VANTA_THEME is unset", () => {
    const t = resolveTheme({});
    expect(t.primary).toBe("white");
    expect(t.accent).toBe("cyan");
    expect(t.border).toBe("cyan");
    expect(t.marker).toBe("cyan");
  });

  it("returns high-contrast theme", () => {
    const t = resolveTheme({ VANTA_THEME: "high-contrast" });
    expect(t.primary).toBe("white");
    expect(t.accent).toBe("yellow");
    expect(t.dimText).toBe(false);
  });

  it("returns muted theme", () => {
    const t = resolveTheme({ VANTA_THEME: "muted" });
    expect(t.border).toBe("gray");
    expect(t.dimText).toBe(true);
  });

  it("returns dyslexia theme", () => {
    const t = resolveTheme({ VANTA_THEME: "dyslexia" });
    expect(t.accent).toBe("yellow");
    expect(t.border).toBe("green");
    expect(t.dimText).toBe(false);
  });

  it("falls back to default for unknown theme names", () => {
    const t = resolveTheme({ VANTA_THEME: "nonexistent" });
    expect(t.accent).toBe("cyan");
  });

  it("is case-insensitive", () => {
    const t = resolveTheme({ VANTA_THEME: "HIGH-CONTRAST" });
    expect(t.accent).toBe("yellow");
  });
});

describe("THEME_NAMES + resolveThemeByName", () => {
  it("lists the real selectable theme names", () => {
    expect(THEME_NAMES).toEqual(["default", "high-contrast", "muted", "dyslexia"]);
  });
  it("resolves a theme by name, case-insensitively", () => {
    expect(resolveThemeByName("DYSLEXIA").accent).toBe("yellow");
  });
  it("falls back to default for an unknown name", () => {
    expect(resolveThemeByName("nope").accent).toBe("cyan");
  });
});

describe("currentThemeName", () => {
  it("defaults to 'default' when unset", () => {
    expect(currentThemeName({})).toBe("default");
  });
  it("returns a known name from env, lower-cased", () => {
    expect(currentThemeName({ VANTA_THEME: "Muted" } as unknown as NodeJS.ProcessEnv)).toBe("muted");
  });
  it("falls back to 'default' for an unknown env value", () => {
    expect(currentThemeName({ VANTA_THEME: "neon" } as unknown as NodeJS.ProcessEnv)).toBe("default");
  });
});
