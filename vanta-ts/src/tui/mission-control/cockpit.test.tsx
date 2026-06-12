import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { render } from "../test-render.js";
import { VerdictLadder } from "./verdict-ladder.js";
import { GoalsPanel } from "./goals-panel.js";
import { LoopsPanel } from "./loops-panel.js";
import { MissionControl } from "./mission-control.js";
import { EMPTY_COCKPIT, type CockpitData, type LoopSummary } from "./cockpit-data.js";
import type { Goal } from "../../types.js";

const goals: Goal[] = [
  { id: 1, text: "ship the keybinding registry", status: "active" },
  { id: 2, text: "wire the cockpit", status: "done" },
];
const loops: LoopSummary[] = [
  { id: "nightly", goal: "keep tests green", status: "active", iterations: 4, openEscalations: 0, inProgress: true },
  { id: "blocked", goal: "deploy", status: "paused", iterations: 2, openEscalations: 1, inProgress: false },
];
const data: CockpitData = { goals, loops };

describe("VerdictLadder", () => {
  it("documents all three kernel verdict tiers", () => {
    const inst = render(h(VerdictLadder, { width: 60 }));
    const out = inst.lastFrame();
    expect(out).toContain("ALLOW");
    expect(out).toContain("ASK");
    expect(out).toContain("BLOCK");
    inst.unmount();
  });
});

describe("GoalsPanel", () => {
  it("lists live goals", () => {
    const inst = render(h(GoalsPanel, { goals, width: 60 }));
    const out = inst.lastFrame();
    expect(out).toContain("ship the keybinding registry");
    expect(out).toContain("wire the cockpit");
    inst.unmount();
  });
  it("shows an empty hint when there are no goals", () => {
    const inst = render(h(GoalsPanel, { goals: [], width: 60 }));
    expect(inst.lastFrame()).toContain("No goals yet");
    inst.unmount();
  });
});

describe("LoopsPanel", () => {
  it("lists loops with iteration + escalation meta", () => {
    const inst = render(h(LoopsPanel, { loops, width: 80 }));
    const out = inst.lastFrame();
    expect(out).toContain("keep tests green");
    expect(out).toContain("4 iter");
    expect(out).toContain("⚑"); // the blocked loop's open escalation badge
    inst.unmount();
  });
  it("shows an empty hint when there are no loops", () => {
    const inst = render(h(LoopsPanel, { loops: [], width: 60 }));
    expect(inst.lastFrame()).toContain("No standing loops");
    inst.unmount();
  });
});

describe("MissionControl", () => {
  it("opens on the Kernel tab", () => {
    const inst = render(h(MissionControl, { data, width: 80, onClose: () => {} }));
    const out = inst.lastFrame();
    expect(out).toContain("Kernel");
    expect(out).toContain("ALLOW"); // Kernel panel is active first
    expect(out).toContain("to close");
    inst.unmount();
  });
  it("renders the tab bar with all three screens", () => {
    const inst = render(h(MissionControl, { data: EMPTY_COCKPIT, width: 80, onClose: () => {} }));
    const out = inst.lastFrame();
    expect(out).toContain("Kernel");
    expect(out).toContain("Goals");
    expect(out).toContain("Loops");
    inst.unmount();
  });

  it("switches to the Goals tab when tab is pressed (tabs.next)", async () => {
    const inst = render(h(MissionControl, { data, width: 80, onClose: () => {} }));
    const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 40));
    await wait();
    inst.stdin.write("\t"); // tab → tabs.next
    await wait();
    const out = inst.lastFrame();
    expect(out).toContain("ship the keybinding registry"); // Goals panel now active
    expect(out).not.toContain("ALLOW"); // Kernel panel no longer shown
    inst.unmount();
  });

  it("closes on q (laptop-friendly tabs.close)", async () => {
    let closed = 0;
    const inst = render(h(MissionControl, { data, width: 80, onClose: () => { closed++; } }));
    const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 40));
    await wait();
    inst.stdin.write("q"); // q → tabs.close
    await wait();
    expect(closed).toBe(1);
    inst.unmount();
  });
});
