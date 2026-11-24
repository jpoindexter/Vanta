import { describe, expect, it } from "vitest";
import {
  WORK_ITEM_STATES,
  RECEIPT_DISPOSITIONS,
  WorkItemSchema,
  ReceiptSchema,
  canCreateAccomplishmentMemory,
  settleWorkItem,
  transitionAllowed,
} from "./contract.js";

describe("canonical WorkItem contract", () => {
  it("contains exactly the ordered nine-state lifecycle", () => {
    expect(WORK_ITEM_STATES).toEqual([
      "draft",
      "queued",
      "running",
      "waiting",
      "needs human",
      "stopped",
      "failed",
      "unverified",
      "verified",
    ]);
  });

  it("keeps action dispositions out of WorkItem state", () => {
    expect(RECEIPT_DISPOSITIONS).toEqual(["none", "confirmed", "denied", "expired", "unknown", "compensated"]);
    expect(WorkItemSchema.safeParse({
      version: 1,
      id: "w1",
      outcome: "Send the update",
      source: "user",
      state: "denied",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }).success).toBe(false);
    expect(ReceiptSchema.safeParse({
      version: 1,
      id: "r1",
      workItemId: "w1",
      runId: "run1",
      action: "send email",
      disposition: "denied",
      at: "2026-07-31T00:00:00.000Z",
    }).success).toBe(true);
  });

  it("does not call an unverified success verified", () => {
    expect(settleWorkItem({ ok: true, disposition: "confirmed" })).toBe("unverified");
    expect(settleWorkItem({ ok: true, disposition: "confirmed", verification: "verified" })).toBe("verified");
    expect(settleWorkItem({ ok: false, disposition: "confirmed" })).toBe("failed");
    expect(settleWorkItem({ ok: false, disposition: "unknown" })).toBe("unverified");
    expect(settleWorkItem({ ok: false, disposition: "denied" })).toBe("stopped");
  });

  it("only verified WorkItems can create accomplishment memory", () => {
    for (const state of WORK_ITEM_STATES) {
      expect(canCreateAccomplishmentMemory(state)).toBe(state === "verified");
    }
  });

  it("permits recovery and human-resolution paths but not post-verification rewrites", () => {
    expect(transitionAllowed("draft", "queued")).toBe(true);
    expect(transitionAllowed("running", "needs human")).toBe(true);
    expect(transitionAllowed("needs human", "queued")).toBe(true);
    expect(transitionAllowed("unverified", "running")).toBe(true);
    expect(transitionAllowed("verified", "running")).toBe(false);
  });

  it("carries the minimum operator spine without inventing another lifecycle", () => {
    const parsed = WorkItemSchema.parse({
      version: 1,
      id: "w-spine",
      outcome: "Choose the first unfinished action from the local brief",
      source: "local-file:brief.md",
      state: "waiting",
      owner: "operator",
      waitCondition: "When the operator is ready to continue",
      nextAction: "Open the brief at the first unchecked item",
      resumeContext: "The source was verified at sha256:abc before waiting",
      provenanceMemory: [{ source: "brief.md", capturedAt: "2026-08-02T12:00:00.000Z", sourceId: "brief.md" }],
      followUp: { at: "2026-08-03T09:00:00.000Z", condition: "Snooze elapsed" },
      timeCapacityFit: {
        minutes: 10,
        capacity: { cognitive: "unknown", attentional: "low", sensory: "unknown", social: "unknown", emotional: "unknown", physical: "unknown", time: "steady" },
      },
      blocker: "Waiting for the operator",
      artifacts: [{ kind: "note", ref: "continuity:w-spine", sha256: "a".repeat(64) }],
      lastVerified: { state: "waiting", at: "2026-08-02T12:01:00.000Z", evidence: `sha256:${"b".repeat(64)}` },
      updatedAt: "2026-08-02T12:01:00.000Z",
    });

    expect(parsed.state).toBe("waiting");
    expect(parsed.timeCapacityFit?.capacity.attentional).toBe("low");
    expect(parsed.artifacts).toHaveLength(1);
    expect(WORK_ITEM_STATES).toHaveLength(9);
  });
});
