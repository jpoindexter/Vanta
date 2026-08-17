import { describe, expect, it } from "vitest";
import { projectWorkItems } from "./projections.js";
import type { WorkItem, WorkItemState } from "./contract.js";

const states: WorkItemState[] = [
  "draft",
  "queued",
  "running",
  "waiting",
  "needs human",
  "stopped",
  "failed",
  "unverified",
  "verified",
];

const item = (state: WorkItemState): WorkItem => ({
  version: 1,
  id: state,
  outcome: `Outcome in ${state}`,
  source: "test",
  state,
  updatedAt: "2026-08-02T12:00:00.000Z",
});

describe("WorkItem projections", () => {
  it("derives the five operator views without inventing lifecycle states", () => {
    const projected = projectWorkItems(states.map(item));

    expect(projected.captured.map((row) => row.state)).toEqual(["draft"]);
    expect(projected.now.map((row) => row.state)).toEqual(["queued", "running"]);
    expect(projected.waiting.map((row) => row.state)).toEqual(["waiting"]);
    expect(projected.needsYou.map((row) => row.state)).toEqual(["needs human"]);
    expect(projected.done.map((row) => row.state)).toEqual(["verified"]);
    expect(Object.keys(projected)).toEqual(["captured", "now", "waiting", "needsYou", "done"]);
  });

  it("does not mutate the canonical WorkItems while projecting", () => {
    const input = states.map(item);
    const before = JSON.stringify(input);

    projectWorkItems(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});
