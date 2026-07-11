import { describe, expect, it } from "vitest";
import { decomposeGoal } from "./kanban.js";
import { formatKanbanBoard } from "./format.js";
import {
  addRoutedLane,
  claimRoutedLane,
  handoffRoutedLane,
  retryRoutedLane,
  routeLaneBySkills,
  updateRoutedLane,
} from "./router.js";

const NOW = () => new Date("2026-07-11T14:00:00.000Z");
const board = () => decomposeGoal("ship routed work", { now: NOW });

describe("profile kanban router", () => {
  it("adds a card with profile routing metadata", () => {
    const next = addRoutedLane(board(), {
      id: "research",
      title: "Research sources",
      instruction: "Find primary evidence",
      ownerProfile: "research-lead",
      requiredSkills: ["research", "citations"],
      dependencies: ["understand"],
      wakePolicy: "immediate",
    }, NOW);
    expect(next.lanes.at(-1)).toMatchObject({
      id: "research", ownerProfile: "research-lead", requiredSkills: ["research", "citations"],
      dependencies: ["understand"], wakePolicy: "immediate", evidence: [], retries: 0,
    });
  });

  it("refuses claim until dependencies and required skills are satisfied", () => {
    const next = addRoutedLane(board(), {
      id: "research", title: "Research", instruction: "Research", requiredSkills: ["research"],
      dependencies: ["understand"], wakePolicy: "manual",
    }, NOW);
    expect(() => claimRoutedLane(next, "research", { id: "writer", skills: ["writing"] }, NOW)).toThrow("dependency understand is not done");
    const doneDependency = { ...next, lanes: next.lanes.map((lane) => lane.id === "understand" ? { ...lane, status: "done" as const } : lane) };
    expect(() => claimRoutedLane(doneDependency, "research", { id: "writer", skills: ["writing"] }, NOW)).toThrow("missing required skills: research");
  });

  it("routes to the first capable profile and records handoff history", () => {
    const next = addRoutedLane(board(), { id: "research", title: "Research", instruction: "Research", requiredSkills: ["research"], wakePolicy: "manual" }, NOW);
    const routed = routeLaneBySkills(next, "research", [
      { id: "writer", skills: ["writing"] },
      { id: "research-lead", skills: ["research", "citations"] },
    ], NOW);
    expect(routed.lanes.at(-1)).toMatchObject({ ownerProfile: "research-lead", status: "running" });
    const handed = handoffRoutedLane(routed, "research", { to: "research-backup", reason: "primary unavailable" }, NOW);
    expect(handed.lanes.at(-1)?.handoffs[0]).toMatchObject({ from: "research-lead", to: "research-backup", reason: "primary unavailable" });
  });

  it("requires evidence to close and exposes retry plus fallback for failures", () => {
    const next = addRoutedLane(board(), { id: "research", title: "Research", instruction: "Research", fallbackProfile: "research-backup", wakePolicy: "manual" }, NOW);
    expect(() => updateRoutedLane(next, "research", { status: "done", detail: "finished" }, NOW)).toThrow("requires receipt evidence");
    const blocked = updateRoutedLane(next, "research", { status: "blocked", detail: "provider timeout" }, NOW);
    expect(formatKanbanBoard(blocked)).toContain("retry: vanta kanban retry research");
    expect(formatKanbanBoard(blocked)).toContain("fallback: research-backup");
    const retried = retryRoutedLane(blocked, "research", NOW);
    expect(retried.lanes.at(-1)).toMatchObject({ status: "todo", retries: 1, blocker: undefined });
    const done = updateRoutedLane(retried, "research", { status: "done", detail: "finished", evidence: ["receipts/research.json"] }, NOW);
    expect(done.lanes.at(-1)).toMatchObject({ status: "done", evidence: ["receipts/research.json"] });
  });
});
