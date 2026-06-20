import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "../test-render.js";
import { Byline } from "./byline.js";

describe("Byline", () => {
  it("renders the author with the default marker glyph", async () => {
    const inst = renderUi(h(Byline, { author: "vanta" }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("vanta");
    expect(frame).toContain("⏺"); // GLYPHS.dot
    inst.unmount();
  });

  it("renders secondary parts separated by the mid-dot", async () => {
    const inst = renderUi(h(Byline, { author: "vanta", parts: ["2m ago", "semantic"] }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("2m ago");
    expect(frame).toContain("semantic");
    expect(frame).toContain("·"); // GLYPHS.mid separator
    inst.unmount();
  });

  it("uses a custom marker when provided", async () => {
    const inst = renderUi(h(Byline, { author: "user", marker: "❯" }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("❯");
    expect(frame).toContain("user");
    inst.unmount();
  });
});
