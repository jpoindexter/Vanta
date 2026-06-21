import { describe, it, expect } from "vitest";
import { taskProducedArtifact, artifactProbeForTask } from "./outcome-gate.js";
import { canCloseTask, type OutcomeContract } from "./outcome-contract.js";
import type { WorkProduct } from "./work-products.js";

function product(over: Partial<WorkProduct> = {}): WorkProduct {
  return {
    id: "dept-wp-1",
    artifact: "the spec",
    kind: "document",
    sourceTaskId: "t1",
    departmentId: "eng",
    producedBy: "w1",
    approved: false,
    createdAt: "2026-06-21T00:00:00.000Z",
    ...over,
  };
}

describe("taskProducedArtifact", () => {
  it("true when a work-product exists for the task", () => {
    expect(taskProducedArtifact([product({ sourceTaskId: "t1" })], "t1")).toBe(true);
  });

  it("false when no work-product references the task", () => {
    expect(taskProducedArtifact([product({ sourceTaskId: "other" })], "t1")).toBe(false);
  });

  it("false on an empty store (default-permissive only matters with a contract)", () => {
    expect(taskProducedArtifact([], "t1")).toBe(false);
  });

  it("false for an empty / whitespace task id", () => {
    expect(taskProducedArtifact([product()], "")).toBe(false);
    expect(taskProducedArtifact([product()], "   ")).toBe(false);
  });

  it("matches on trimmed task id", () => {
    expect(taskProducedArtifact([product({ sourceTaskId: "t1" })], "  t1  ")).toBe(true);
  });
});

describe("artifactProbeForTask + canCloseTask integration", () => {
  const contract: OutcomeContract = { expectedOutput: "document" };

  it("a declared outcome closes when its task produced an artifact", () => {
    const probe = artifactProbeForTask([product({ sourceTaskId: "t1" })], "t1");
    expect(canCloseTask(contract, probe)).toBe(true);
  });

  it("a declared outcome is REFUSED when the task produced no artifact", () => {
    const probe = artifactProbeForTask([product({ sourceTaskId: "other" })], "t1");
    expect(canCloseTask(contract, probe)).toBe(false);
  });

  it("a no-artifact reason closes regardless of the store (force-close path)", () => {
    const forced: OutcomeContract = { expectedOutput: "document", noArtifactReason: "client cancelled" };
    const probe = artifactProbeForTask([], "t1");
    expect(canCloseTask(forced, probe)).toBe(true);
  });
});
