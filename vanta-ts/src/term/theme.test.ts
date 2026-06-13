import { describe, it, expect } from "vitest";
import {
  resolveTheme,
  resolveThemeByName,
  currentThemeName,
  detectBackground,
  detectThemeName,
  THEME_NAMES,
} from "./theme.js";

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

describe("detectBackground", () => {
  it("returns 'unknown' when COLORFGBG is absent", () => {
    expect(detectBackground({})).toBe("unknown");
  });

  it("returns 'dark' for bg=0 (classic black)", () => {
    expect(detectBackground({ COLORFGBG: "15;0" })).toBe("dark");
  });

  it("returns 'dark' for bg=8 (dark gray)", () => {
    expect(detectBackground({ COLORFGBG: "7;8" })).toBe("dark");
  });

  it("returns 'dark' for bg=6 (dark cyan)", () => {
    expect(detectBackground({ COLORFGBG: "0;6" })).toBe("dark");
  });

  it("returns 'light' for bg=7 (light gray / white)", () => {
    expect(detectBackground({ COLORFGBG: "0;7" })).toBe("light");
  });

  it("returns 'light' for bg=15 (bright white)", () => {
    expect(detectBackground({ COLORFGBG: "0;15" })).toBe("light");
  });

  it("returns 'light' for bg=9 (bright red — edge of light range)", () => {
    expect(detectBackground({ COLORFGBG: "0;9" })).toBe("light");
  });

  it("returns 'unknown' for unparseable value", () => {
    expect(detectBackground({ COLORFGBG: "foo;bar" })).toBe("unknown");
  });

  it("returns 'unknown' for out-of-range value", () => {
    expect(detectBackground({ COLORFGBG: "0;99" })).toBe("unknown");
  });
});

describe("detectThemeName", () => {
  it("returns 'default' on dark terminal with no override", () => {
    expect(detectThemeName({ COLORFGBG: "15;0" })).toBe("default");
  });

  it("returns 'high-contrast' on light terminal with no override", () => {
    expect(detectThemeName({ COLORFGBG: "0;7" })).toBe("high-contrast");
  });

  it("returns 'default' when COLORFGBG is unknown and no override", () => {
    expect(detectThemeName({})).toBe("default");
  });

  it("VANTA_THEME override beats light-bg detection", () => {
    expect(detectThemeName({ COLORFGBG: "0;7", VANTA_THEME: "muted" })).toBe("muted");
  });

  it("VANTA_THEME override beats dark-bg detection", () => {
    expect(detectThemeName({ COLORFGBG: "15;0", VANTA_THEME: "dyslexia" })).toBe("dyslexia");
  });

  it("invalid VANTA_THEME falls through to bg detection (light → high-contrast)", () => {
    expect(detectThemeName({ COLORFGBG: "0;7", VANTA_THEME: "neon" })).toBe("high-contrast");
  });

  it("invalid VANTA_THEME falls through to bg detection (dark → default)", () => {
    expect(detectThemeName({ COLORFGBG: "15;0", VANTA_THEME: "neon" })).toBe("default");
  });
});

describe("resolveTheme auto-detect integration", () => {
  it("light terminal with no override yields high-contrast theme", () => {
    const t = resolveTheme({ COLORFGBG: "0;7" });
    expect(t.accent).toBe("yellow");   // high-contrast accent
    expect(t.dimText).toBe(false);
  });

  it("dark terminal with no override yields default theme", () => {
    const t = resolveTheme({ COLORFGBG: "15;0" });
    expect(t.accent).toBe("cyan");     // default accent
  });

  it("VANTA_THEME override on light terminal uses the explicit theme", () => {
    const t = resolveTheme({ COLORFGBG: "0;7", VANTA_THEME: "muted" });
    expect(t.border).toBe("gray");     // muted border
  });
});
