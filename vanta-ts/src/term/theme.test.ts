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
  it("returns mono theme when VANTA_THEME is unset (dark/unknown terminal)", () => {
    const t = resolveTheme({});
    expect(t.primary).toBe("white");
    expect(t.accent).toBe("#888888");
    expect(t.border).toBe("#555555");
    expect(t.marker).toBe("white");
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

  it("falls back to mono for unknown theme names", () => {
    const t = resolveTheme({ VANTA_THEME: "nonexistent" });
    expect(t.accent).toBe("#888888");
  });

  it("is case-insensitive", () => {
    const t = resolveTheme({ VANTA_THEME: "HIGH-CONTRAST" });
    expect(t.accent).toBe("yellow");
  });
});

describe("THEME_NAMES + resolveThemeByName", () => {
  it("lists the real selectable theme names", () => {
    expect(THEME_NAMES).toEqual(["mono", "default", "light", "high-contrast", "muted", "dyslexia"]);
  });
  it("resolves a theme by name, case-insensitively", () => {
    expect(resolveThemeByName("DYSLEXIA").accent).toBe("yellow");
  });
  it("falls back to mono for an unknown name", () => {
    expect(resolveThemeByName("nope").accent).toBe("#888888");
  });
});

describe("currentThemeName", () => {
  it("defaults to 'mono' when unset", () => {
    expect(currentThemeName({})).toBe("mono");
  });
  it("returns a known name from env, lower-cased", () => {
    expect(currentThemeName({ VANTA_THEME: "Muted" } as unknown as NodeJS.ProcessEnv)).toBe("muted");
  });
  it("falls back to 'mono' for an unknown env value", () => {
    expect(currentThemeName({ VANTA_THEME: "neon" } as unknown as NodeJS.ProcessEnv)).toBe("mono");
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
  it("returns 'mono' on dark terminal with no override", () => {
    expect(detectThemeName({ COLORFGBG: "15;0" })).toBe("mono");
  });

  it("returns 'light' on light terminal with no override", () => {
    expect(detectThemeName({ COLORFGBG: "0;7" })).toBe("light");
  });

  it("returns 'mono' when COLORFGBG is unknown and no override", () => {
    expect(detectThemeName({})).toBe("mono");
  });

  it("VANTA_THEME override beats light-bg detection", () => {
    expect(detectThemeName({ COLORFGBG: "0;7", VANTA_THEME: "muted" })).toBe("muted");
  });

  it("VANTA_THEME override beats dark-bg detection", () => {
    expect(detectThemeName({ COLORFGBG: "15;0", VANTA_THEME: "dyslexia" })).toBe("dyslexia");
  });

  it("invalid VANTA_THEME falls through to bg detection (light → light)", () => {
    expect(detectThemeName({ COLORFGBG: "0;7", VANTA_THEME: "neon" })).toBe("light");
  });

  it("invalid VANTA_THEME falls through to bg detection (dark → mono)", () => {
    expect(detectThemeName({ COLORFGBG: "15;0", VANTA_THEME: "neon" })).toBe("mono");
  });
});

describe("resolveTheme auto-detect integration", () => {
  it("light terminal with no override yields light theme", () => {
    const t = resolveTheme({ COLORFGBG: "0;7" });
    expect(t.accent).toBe("#2d6680");  // light theme accent (dark muted teal)
    expect(t.dimText).toBe(true);
  });

  it("dark terminal with no override yields mono theme", () => {
    const t = resolveTheme({ COLORFGBG: "15;0" });
    expect(t.accent).toBe("#888888");  // mono accent
  });

  it("VANTA_THEME override on light terminal uses the explicit theme", () => {
    const t = resolveTheme({ COLORFGBG: "0;7", VANTA_THEME: "muted" });
    expect(t.border).toBe("gray");     // muted border
  });
});
