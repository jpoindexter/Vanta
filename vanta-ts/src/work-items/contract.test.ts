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
});
