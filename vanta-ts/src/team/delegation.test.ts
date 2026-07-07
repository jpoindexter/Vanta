import { describe, it, expect } from "vitest";
import { planDelegateDown, planEscalateUp } from "./delegation.js";
import type { Worker } from "./store.js";

// PCLIP-DELEGATION-UPDOWN — assign down to a report / escalate up to a manager.

const W = (id: string, managerId?: string): Worker => ({ kind: "worker", id, role: id, status: "idle", ts: "t", managerId });
// lead → { ana, bo }; ana → { cy }
const ORG = [W("lead"), W("ana", "lead"), W("bo", "lead"), W("cy", "ana")];

describe("planDelegateDown", () => {
  it("assigns a subtask to a direct report", () => {
    const p = planDelegateDown(ORG, { managerId: "lead", reportId: "ana", taskId: "t1", title: "do X" });
    expect(p).toEqual({ ok: true, task: { taskId: "t1", workerId: "ana", title: "do X" } });
  });

  it("refuses a non-report (delegation follows the chart)", () => {
    // cy is ana's report, not lead's → lead can't delegate straight to cy.
    const p = planDelegateDown(ORG, { managerId: "lead", reportId: "cy", taskId: "t1", title: "x" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("not a direct report");
  });

  it("refuses an unknown manager (no reports)", () => {
    expect(planDelegateDown(ORG, { managerId: "ghost", reportId: "ana", taskId: "t", title: "x" }).ok).toBe(false);
  });
});

describe("planEscalateUp", () => {
  it("escalates a blocker to the worker's manager, titled with its origin", () => {
    const p = planEscalateUp(ORG, { fromId: "cy", taskId: "e1", blocker: "API down" });
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.task.workerId).toBe("ana"); // cy's manager
      expect(p.task.title).toBe("[escalated from cy] API down");
    }
  });

  it("refuses when the worker has no manager (a root)", () => {
    const p = planEscalateUp(ORG, { fromId: "lead", taskId: "e1", blocker: "x" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("no manager");
  });
});
