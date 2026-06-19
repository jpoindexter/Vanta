import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { AgentPill, Footer, agentPillText } from "./app-regions.js";
import type { SubagentProgress } from "../subagent/progress-store.js";

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
