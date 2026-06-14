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
  it("ships the 4 canonical themes", () => {
    expect(THEME_NAMES).toEqual(["default", "light", "high-contrast", "muted", "dyslexia"]);
  });

  it("delivers the selected theme's tokens to children", async () => {
    const inst = renderUi(h(ThemeProvider, { theme: resolveThemeByName("high-contrast"), children: h(Probe) }));
    await tick();
    expect(inst.lastFrame()).toContain("yellow"); // high-contrast accent + marker
    inst.unmount();
  });

  it("falls back to the default theme without a provider", async () => {
    const inst = renderUi(h(Probe));
    await tick();
    expect(inst.lastFrame()).toContain("#a09890"); // default accent
    inst.unmount();
  });
});
