import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { FooterHint } from "./footer-hint.js";
import { GLYPHS } from "./figures.js";

describe("FooterHint", () => {
  it("renders mode symbol + title + model + shortcut hint", () => {
    const inst = render(h(FooterHint, { mode: "review", model: "gemini-2.5-flash", accentColor: "cyan", width: 80 }));
    const out = inst.lastFrame();
    expect(out).toContain(GLYPHS.ring);
    expect(out).toContain("review");
    expect(out).toContain("gemini-2.5-flash");
    expect(out).toContain("? for shortcuts");
    inst.unmount();
  });

  it("uses filled-circle symbol for auto mode", () => {
    const inst = render(h(FooterHint, { mode: "auto", model: "m", accentColor: "cyan", width: 80 }));
    expect(inst.lastFrame()).toContain(GLYPHS.bullet);
    inst.unmount();
  });

  it("uses half-ring symbol for accept-edits mode", () => {
    const inst = render(h(FooterHint, { mode: "accept-edits", model: "m", accentColor: "cyan", width: 80 }));
    expect(inst.lastFrame()).toContain(GLYPHS.halfRing);
    inst.unmount();
  });

  it("separates parts with the mid dot", () => {
    const inst = render(h(FooterHint, { mode: "review", model: "m", accentColor: "cyan", width: 80 }));
    expect(inst.lastFrame()).toContain(GLYPHS.mid);
    inst.unmount();
  });
});
