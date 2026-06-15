import { createElement as h, type ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { Text } from "ink";
import { renderUi, tick } from "./test-render.js";
import { ThemeProvider, useTheme } from "./theme.js";
import { resolveThemeByName, THEME_NAMES } from "../term/theme.js";

function Probe(): ReactElement {
  const t = useTheme();
  return h(Text, null, `${t.accent}|${t.marker}`);
}

describe("theme plumbing", () => {
  it("ships the canonical themes including mono as first entry", () => {
    expect(THEME_NAMES).toContain("mono");
    expect(THEME_NAMES).toContain("default");
    expect(THEME_NAMES).toContain("high-contrast");
    expect(THEME_NAMES).toContain("muted");
    expect(THEME_NAMES).toContain("dyslexia");
    expect(THEME_NAMES[0]).toBe("mono"); // mono is the default fallback
  });

  it("delivers the selected theme's tokens to children", async () => {
    const inst = renderUi(h(ThemeProvider, { theme: resolveThemeByName("high-contrast"), children: h(Probe) }));
    await tick();
    expect(inst.lastFrame()).toContain("yellow"); // high-contrast accent + marker
    inst.unmount();
  });

  it("falls back to the mono theme without a provider (mono is the env default)", async () => {
    const inst = renderUi(h(Probe));
    await tick();
    expect(inst.lastFrame()).toContain("#888888"); // mono accent
    inst.unmount();
  });
});
