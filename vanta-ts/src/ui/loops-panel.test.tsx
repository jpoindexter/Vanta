import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { LoopsPanel } from "./loops-panel.js";
import type { LoopSummary } from "../loop/summary.js";

const makeLoop = (overrides: Partial<LoopSummary> = {}): LoopSummary => ({
  id: "test-loop",
  goal: "improve the test suite coverage",
  status: "active",
  iterations: 7,
  lastScore: 0.82,
  bestScore: 0.9,
  inProgress: false,
  openEscalations: 0,
  ...overrides,
});

describe("LoopsPanel — renders loop list", () => {
  it("shows the goal and iteration meta for a loop", async () => {
    const loops = [makeLoop()];
    const inst = renderUi(h(LoopsPanel, { loops, onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("improve the test suite coverage");
    expect(out).toContain("iter 7");
    expect(out).toContain("score 0.82");
    inst.unmount();
  });

  it("shows escalation warning when openEscalations > 0", async () => {
    const loops = [makeLoop({ openEscalations: 2, status: "paused" })];
    const inst = renderUi(h(LoopsPanel, { loops, onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("2 escalation");
    inst.unmount();
  });

  it("shows the empty-state message when no loops exist", async () => {
    const inst = renderUi(h(LoopsPanel, { loops: [], onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("(no loops");
    inst.unmount();
  });

  it("shows the Esc footer", async () => {
    const inst = renderUi(h(LoopsPanel, { loops: [], onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Esc close");
    inst.unmount();
  });

  it("renders the Loops title", async () => {
    const inst = renderUi(h(LoopsPanel, { loops: [], onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Loops");
    inst.unmount();
  });

  it("renders multiple loops", async () => {
    const loops = [
      makeLoop({ id: "loop-a", goal: "goal alpha" }),
      makeLoop({ id: "loop-b", goal: "goal beta", iterations: 3, lastScore: null }),
    ];
    const inst = renderUi(h(LoopsPanel, { loops, onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("goal alpha");
    expect(out).toContain("goal beta");
    expect(out).toContain("score —");
    inst.unmount();
  });
});
