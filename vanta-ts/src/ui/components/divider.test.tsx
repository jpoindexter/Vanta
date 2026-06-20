import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "../test-render.js";
import { Divider } from "./divider.js";

describe("Divider", () => {
  it("spans the requested fixed width with the rule glyph", async () => {
    const inst = renderUi(h(Divider, { width: 10 }));
    await tick();
    expect(inst.lastFrame()).toContain("─".repeat(10));
    inst.unmount();
  });

  it("spans (near) the terminal width by default", async () => {
    const inst = renderUi(h(Divider, {}), { cols: 40 });
    await tick();
    // default width is cols - 1 = 39
    expect(inst.lastFrame()).toContain("─".repeat(39));
    inst.unmount();
  });

  it("centers a label between two rule runs", async () => {
    const inst = renderUi(h(Divider, { width: 20, label: "Section" }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Section");
    expect(frame).toContain("─"); // rule glyphs flank the label
    inst.unmount();
  });

  it("never renders below the minimum width", async () => {
    const inst = renderUi(h(Divider, { width: 1 }));
    await tick();
    expect(inst.lastFrame()).toContain("─".repeat(4));
    inst.unmount();
  });
});
