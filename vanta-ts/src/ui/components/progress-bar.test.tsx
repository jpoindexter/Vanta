import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "../test-render.js";
import { ProgressBar, barCells } from "./progress-bar.js";

describe("barCells — pure fill computation", () => {
  it("is empty at 0", () => expect(barCells(0, 10, 20)).toBe(0));
  it("is full at max", () => expect(barCells(10, 10, 20)).toBe(20));
  it("is half-full at 50%", () => expect(barCells(5, 10, 20)).toBe(10));
  it("clamps overflow to the track width", () => expect(barCells(99, 10, 20)).toBe(20));
  it("clamps negative to 0", () => expect(barCells(-5, 10, 20)).toBe(0));
  it("returns 0 for a non-positive max", () => expect(barCells(5, 0, 20)).toBe(0));
});

describe("ProgressBar", () => {
  it("renders a half-filled bar at 50%", async () => {
    const inst = renderUi(h(ProgressBar, { value: 5, max: 10, width: 20 }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("█".repeat(10)); // 10 filled cells
    expect(frame).toContain("░".repeat(10)); // 10 empty cells
    inst.unmount();
  });

  it("renders a fully-filled bar at 100% with percent", async () => {
    const inst = renderUi(h(ProgressBar, { value: 1, max: 1, width: 8, showPercent: true }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("█".repeat(8));
    expect(frame).not.toContain("░");
    expect(frame).toContain("100%");
    inst.unmount();
  });

  it("renders an empty bar at 0%", async () => {
    const inst = renderUi(h(ProgressBar, { value: 0, max: 10, width: 6 }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("░".repeat(6));
    expect(frame).not.toContain("█");
    inst.unmount();
  });
});
