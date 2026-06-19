import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { LiveRegion, TeammateTree } from "./app-regions.js";
import type { SubagentProgress } from "../subagent/progress-store.js";

const editing: SubagentProgress = { id: "a", title: "fix auth", summary: "Editing auth.ts", updatedAt: 2 };
const reading: SubagentProgress = { id: "b", title: "audit docs", summary: "Reading README.md", updatedAt: 1 };
const leader = { verb: "working", tokens: 24_000, secs: 6 };

describe("TeammateTree (VANTA-SPINNER-TEAMMATE)", () => {
  it("renders a leader line (verb + tokens) above one line per teammate", async () => {
    const inst = renderUi(h(TeammateTree, { agents: [editing, reading], leader, selected: -1, frame: "✻" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("working");
    expect(out).toContain("24k tokens");
    expect(out).toContain("fix auth");
    expect(out).toContain("Editing auth.ts");
    expect(out).toContain("audit docs");
    expect(out).toContain("Reading README.md");
    expect(out).toContain("shift+←/→"); // focus-switch hint
    inst.unmount();
  });

  it("renders nothing for fewer than two agents", async () => {
    const inst = renderUi(h(TeammateTree, { agents: [editing], leader, selected: -1, frame: "✻" }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });

  it("shows the focus pointer on the selected teammate", async () => {
    const inst = renderUi(h(TeammateTree, { agents: [editing, reading], leader, selected: 1, frame: "✻" }));
    await tick();
    const lines = inst.lastFrame().split("\n");
    const selected = lines.find((l) => l.includes("audit docs"));
    expect(selected).toContain("❯");
    inst.unmount();
  });
});

describe("LiveRegion teammate tree integration", () => {
  it("renders the tree when two or more agents run", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 0, agents: [editing, reading], selectedAgent: -1, leaderTokens: 24_000 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("fix auth");
    expect(out).toContain("audit docs");
    expect(out).toContain("24k tokens");
    inst.unmount();
  });

  it("keeps the single thinking spinner with one agent (no regression)", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 0, agents: [editing], selectedAgent: -1 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("esc to interrupt");
    expect(out).not.toContain("fix auth");
    inst.unmount();
  });

  it("keeps the single thinking spinner with zero agents (no regression)", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 0, agents: [] }));
    await tick();
    expect(inst.lastFrame()).toContain("esc to interrupt");
    inst.unmount();
  });
});
