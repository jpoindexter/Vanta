import { describe, it, expect } from "vitest";
import {
  buildTeammateTree,
  clampAgentIndex,
  nextAgentIndex,
  prevAgentIndex,
  LEADER_INDEX,
  TEAMMATE_PENDING,
} from "./teammate-tree.js";
import type { SubagentProgress } from "../subagent/progress-store.js";

const leader = { verb: "working", tokens: 24_000, secs: 6 };
const editing: SubagentProgress = { id: "a", title: "fix auth", summary: "Editing auth.ts", updatedAt: 2 };
const reading: SubagentProgress = { id: "b", title: "audit docs", summary: "Reading README.md", updatedAt: 1 };
const starting: SubagentProgress = { id: "c", title: "summarize the changelog", summary: null, updatedAt: null };

describe("buildTeammateTree", () => {
  it("returns no tree for zero or one running agent (single spinner fallback)", () => {
    expect(buildTeammateTree([], leader, LEADER_INDEX)).toEqual([]);
    expect(buildTeammateTree([editing], leader, LEADER_INDEX)).toEqual([]);
  });

  it("builds a leader line plus one row per teammate", () => {
    const rows = buildTeammateTree([editing, reading], leader, LEADER_INDEX);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "leader", name: "working", selected: true });
    expect(rows[0]!.detail).toContain("24k tokens");
    expect(rows[0]!.detail).toContain("6s");
    expect(rows[1]).toMatchObject({ kind: "teammate", index: 0, name: "fix auth", detail: "Editing auth.ts" });
    expect(rows[2]).toMatchObject({ kind: "teammate", index: 1, name: "audit docs", detail: "Reading README.md" });
  });

  it("uses tree-branch glyphs, last teammate gets the corner", () => {
    const rows = buildTeammateTree([editing, reading], leader, LEADER_INDEX);
    expect(rows[1]!.branch).toBe("├ ");
    expect(rows[2]!.branch).toBe("└ ");
    expect(rows[0]!.branch).toBe("");
  });

  it("shows pending text for a teammate with no summary yet", () => {
    const rows = buildTeammateTree([editing, starting], leader, LEADER_INDEX);
    expect(rows[2]!.detail).toBe(TEAMMATE_PENDING);
  });

  it("marks exactly the selected agent row", () => {
    const rows = buildTeammateTree([editing, reading], leader, 1);
    expect(rows.filter((r) => r.selected)).toHaveLength(1);
    expect(rows.find((r) => r.selected)).toMatchObject({ kind: "teammate", index: 1 });
  });
});

describe("focus cycle (pure next/prev/clamp)", () => {
  it("next cycles leader -> teammates -> wraps back to leader", () => {
    expect(nextAgentIndex(LEADER_INDEX, 2)).toBe(0);
    expect(nextAgentIndex(0, 2)).toBe(1);
    expect(nextAgentIndex(1, 2)).toBe(LEADER_INDEX);
  });

  it("prev wraps leader -> last teammate", () => {
    expect(prevAgentIndex(LEADER_INDEX, 2)).toBe(1);
    expect(prevAgentIndex(1, 2)).toBe(0);
    expect(prevAgentIndex(0, 2)).toBe(LEADER_INDEX);
  });

  it("clamp keeps a selection valid when the agent count shrinks", () => {
    expect(clampAgentIndex(3, 2)).toBe(LEADER_INDEX);
    expect(clampAgentIndex(1, 2)).toBe(1);
    expect(clampAgentIndex(LEADER_INDEX, 2)).toBe(LEADER_INDEX);
    expect(clampAgentIndex(-5, 2)).toBe(1);
  });

  it("collapses to the leader when no agents run", () => {
    expect(nextAgentIndex(0, 0)).toBe(LEADER_INDEX);
    expect(prevAgentIndex(0, 0)).toBe(LEADER_INDEX);
    expect(clampAgentIndex(0, 0)).toBe(LEADER_INDEX);
  });
});
