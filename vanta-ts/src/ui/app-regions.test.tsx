import { createElement as h } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { AgentPill, Footer, LiveRegion, agentPillText } from "./app-regions.js";
import type { SubagentProgress } from "../subagent/progress-store.js";

// Default stall threshold 20_000ms / tick→ms factor 150 → tick ≥ 134 is stalled.
const STALLED_TICK = 200;
const NORMAL_TICK = 5;

function liveRegion(props: { tick: number }) {
  return h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: props.tick });
}

const editing: SubagentProgress = { id: "a", title: "fix auth", summary: "Editing auth.ts", updatedAt: 2 };
const reading: SubagentProgress = { id: "b", title: "audit docs", summary: "Reading README.md", updatedAt: 1 };
const noSummaryYet: SubagentProgress = { id: "c", title: "summarize the changelog file", summary: null, updatedAt: null };

const footerBase = {
  model: "fake-model", effortLevel: "medium" as const, ctxPct: 10, tokens: 1000,
  contextWindow: 200000, turns: 1, busy: false, queued: 0, goal: null, mcp: false, elapsed: "0s",
};

describe("agentPillText", () => {
  it("returns null when no sub-agent is running", () => {
    expect(agentPillText([])).toBeNull();
  });
  it("shows the freshest sub-agent's summary", () => {
    expect(agentPillText([editing, reading])).toBe("Editing auth.ts (+1)");
  });
  it("drops the +N suffix for a single running sub-agent", () => {
    expect(agentPillText([editing])).toBe("Editing auth.ts");
  });
  it("falls back to the clipped title before the first summary", () => {
    expect(agentPillText([noSummaryYet])).toBe("summarize the changelog file");
  });
});

describe("AgentPill", () => {
  it("renders the running sub-agent's summary as a pill", async () => {
    const inst = renderUi(h(AgentPill, { running: [editing] }));
    await tick();
    expect(inst.lastFrame()).toContain("Editing auth.ts");
    inst.unmount();
  });
  it("renders nothing when no sub-agent is running", async () => {
    const inst = renderUi(h(AgentPill, { running: [] }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("Footer sub-agent pill", () => {
  it("shows the live progress summary for a running sub-agent task", async () => {
    const inst = renderUi(h(Footer, { ...footerBase, agents: [editing] }));
    await tick();
    expect(inst.lastFrame()).toContain("Editing auth.ts");
    inst.unmount();
  });
  it("omits the pill when no sub-agent is running", async () => {
    const inst = renderUi(h(Footer, { ...footerBase, agents: [] }));
    await tick();
    expect(inst.lastFrame()).not.toContain("Editing");
    inst.unmount();
  });
});

describe("LiveRegion spinner", () => {
  afterEach(() => { delete process.env.VANTA_SPINNER_VERBS; });

  it("renders a built-in verb by default", async () => {
    const inst = renderUi(liveRegion({ tick: NORMAL_TICK }));
    const frame = await waitForFrame(inst, "esc to interrupt");
    expect(frame).toContain("thinking"); // first built-in verb at a low tick
    expect(frame).not.toContain("still working"); // not stalled
    inst.unmount();
  });

  it("renders user-configured verbs from VANTA_SPINNER_VERBS", async () => {
    process.env.VANTA_SPINNER_VERBS = "Cooking,Brewing";
    const cooking = renderUi(liveRegion({ tick: 0 }));
    expect(await waitForFrame(cooking, "Cooking")).toContain("Cooking");
    cooking.unmount();
    const brewing = renderUi(liveRegion({ tick: 8 }));
    expect(await waitForFrame(brewing, "Brewing")).toContain("Brewing");
    brewing.unmount();
  });

  it("shows the still-working suffix past the stall threshold", async () => {
    const inst = renderUi(liveRegion({ tick: STALLED_TICK }));
    const frame = await waitForFrame(inst, "still working");
    expect(frame).toContain("still working");
    inst.unmount();
  });

  it("shows no still-working suffix under the threshold", async () => {
    const inst = renderUi(liveRegion({ tick: NORMAL_TICK }));
    const frame = await waitForFrame(inst, "esc to interrupt");
    expect(frame).not.toContain("still working");
    inst.unmount();
  });
});

describe("LiveRegion thinking preview (universal reasoning display)", () => {
  it("shows the model's streamed reasoning when liveThinking is present", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 5, liveThinking: "weighing the options" }));
    await waitForFrame(inst, "weighing the options");
    inst.unmount();
  });
  it("falls back to the generic spinner when no reasoning is streamed (e.g. codex)", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 5, liveThinking: "" }));
    const frame = await waitForFrame(inst, "esc to interrupt");
    expect(frame).not.toContain("weighing");
    inst.unmount();
  });
});
