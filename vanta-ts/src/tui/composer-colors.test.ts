import { describe, it, expect } from "vitest";
import { composerColors } from "./composer-colors.js";
import { resolveThemeByName } from "./theme.js";

const theme = resolveThemeByName("default"); // border + primary = cyan
const base = { theme, editActive: false, busy: false, showPalette: false, showAtPalette: false };

describe("composerColors", () => {
  it("uses the theme's border + prompt colours when idle", () => {
    const c = composerColors(base);
    expect(c.borderColor).toBe("cyan");
    expect(c.promptColor).toBe("cyan");
    expect(c.isHistoryActive).toBe(true);
  });

  it("tracks a different theme (so /theme restyles the composer)", () => {
    const c = composerColors({ ...base, theme: resolveThemeByName("dyslexia") });
    expect(c.borderColor).toBe("green");
  });

  it("goes yellow while editing a response", () => {
    const c = composerColors({ ...base, editActive: true });
    expect(c.borderColor).toBe("yellow");
    expect(c.isHistoryActive).toBe(false);
  });

  it("goes gray + 'working…' while busy", () => {
    const c = composerColors({ ...base, busy: true });
    expect(c.borderColor).toBe("gray");
    expect(c.placeholder).toBe("working…");
  });

  it("disables history while a palette is open", () => {
    expect(composerColors({ ...base, showPalette: true }).isHistoryActive).toBe(false);
  });
});
