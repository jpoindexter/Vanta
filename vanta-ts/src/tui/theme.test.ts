import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("returns default theme when VANTA_THEME is unset", () => {
    const t = resolveTheme({});
    expect(t.primary).toBe("cyan");
    expect(t.border).toBe("cyan");
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
    expect(t.primary).toBe("green");
    expect(t.dimText).toBe(false);
  });

  it("falls back to default for unknown theme names", () => {
    const t = resolveTheme({ VANTA_THEME: "nonexistent" });
    expect(t.primary).toBe("cyan");
  });

  it("is case-insensitive", () => {
    const t = resolveTheme({ VANTA_THEME: "HIGH-CONTRAST" });
    expect(t.primary).toBe("white");
  });
});
