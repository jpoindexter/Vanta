import { describe, it, expect } from "vitest";
import { requireStage, decideStage, blockingStages, checkReviewGate, reviewQueue } from "./review-stage.js";
import { advanceTask, type WorkerTask } from "./tasks.js";

// PCLIP-APPROVAL-STAGES — a named review stage routes to a reviewer and blocks
// the done transition until approved.

function task(over: Partial<WorkerTask> = {}): WorkerTask {
  return {
    kind: "task",
    id: over.id ?? "t1",
    workerId: over.workerId ?? "w1",
    title: over.title ?? "ship the thing",
    status: over.status ?? "running",
    created: "2026-07-06T00:00:00.000Z",
    updated: "2026-07-06T00:00:00.000Z",
    ...over,
  };
}

describe("requireStage", () => {
  it("adds a pending stage routed to a reviewer", () => {
    const r = requireStage(task(), "security-review", "alice");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reviewStages).toEqual([{ name: "security-review", reviewerId: "alice", status: "pending" }]);
  });

  it("dedupes by stage name and refuses done/removed tasks", () => {
    const withStage = requireStage(task(), "qa", "alice");
    if (!withStage.ok) throw new Error(withStage.error);
    expect(requireStage(withStage.value, "qa", "bob").ok).toBe(false);
    expect(requireStage(task({ status: "done" }), "qa", "alice").ok).toBe(false);
  });
});

describe("decideStage", () => {
  const staged = (() => {
    const r = requireStage(task(), "qa", "alice");
    if (!r.ok) throw new Error(r.error);
    return r.value;
  })();

  it("approves with provenance", () => {
    const r = decideStage(staged, { name: "qa", approve: true, by: "alice", now: new Date("2026-07-06T10:00:00Z") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reviewStages?.[0]).toMatchObject({ status: "approved", decidedBy: "alice", decidedAt: "2026-07-06T10:00:00.000Z" });
    }
  });

  it("rejects with a reason, and a rejected stage can be re-approved after rework", () => {
    const rejected = decideStage(staged, { name: "qa", approve: false, by: "alice", reason: "missing tests" });
    if (!rejected.ok) throw new Error(rejected.error);
    expect(rejected.value.reviewStages?.[0]).toMatchObject({ status: "rejected", reason: "missing tests" });
    const redeemed = decideStage(rejected.value, { name: "qa", approve: true, by: "alice" });
    expect(redeemed.ok && redeemed.value.reviewStages?.[0]?.status).toBe("approved");
  });

  it("errors on an unknown stage, naming the known ones", () => {
    const r = decideStage(staged, { name: "nope", approve: true, by: "alice" });
    expect(!r.ok && r.error).toContain('no review stage "nope"');
    expect(!r.ok && r.error).toContain("qa");
  });
});

describe("the done gate (via advanceTask)", () => {
  it("blocks done while a stage is pending, with the reviewer named", () => {
    const staged = requireStage(task(), "qa", "alice");
    if (!staged.ok) throw new Error(staged.error);
    const r = advanceTask(staged.value, "done", "finished");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("cannot close");
      expect(r.error).toContain('"qa"');
      expect(r.error).toContain("alice");
    }
  });

  it("blocks done after a rejection (absence of approval blocks, not just pending)", () => {
    const staged = requireStage(task(), "qa", "alice");
    if (!staged.ok) throw new Error(staged.error);
    const rejected = decideStage(staged.value, { name: "qa", approve: false, by: "alice" });
    if (!rejected.ok) throw new Error(rejected.error);
    expect(advanceTask(rejected.value, "done").ok).toBe(false);
  });

  it("allows done once every stage is approved", () => {
    let t = task();
    for (const [name, reviewer] of [["qa", "alice"], ["security", "bob"]] as const) {
      const r = requireStage(t, name, reviewer);
      if (!r.ok) throw new Error(r.error);
      t = r.value;
    }
    expect(advanceTask(t, "done").ok).toBe(false); // both pending
    for (const [name, by] of [["qa", "alice"], ["security", "bob"]] as const) {
      const r = decideStage(t, { name, approve: true, by });
      if (!r.ok) throw new Error(r.error);
      t = r.value;
    }
    const done = advanceTask(t, "done", "shipped");
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.value.status).toBe("done");
  });

  it("leaves stage-free tasks and non-done transitions untouched", () => {
    expect(advanceTask(task(), "done", "x").ok).toBe(true);
    const staged = requireStage(task(), "qa", "alice");
    if (!staged.ok) throw new Error(staged.error);
    expect(advanceTask(staged.value, "blocked", "waiting").ok).toBe(true);
    expect(checkReviewGate(staged.value, "running").ok).toBe(true);
  });
});

describe("reviewQueue", () => {
  it("routes only pending stages of live tasks to their reviewer", () => {
    const a = requireStage(task({ id: "t1", title: "A" }), "qa", "alice");
    const b = requireStage(task({ id: "t2", title: "B" }), "qa", "bob");
    if (!a.ok || !b.ok) throw new Error("setup");
    const decided = decideStage(a.value, { name: "qa", approve: true, by: "alice" });
    if (!decided.ok) throw new Error(decided.error);
    const queue = reviewQueue([decided.value, b.value], "bob");
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ taskId: "t2", title: "B" });
    expect(reviewQueue([decided.value], "alice")).toEqual([]); // approved → out of the queue
    expect(blockingStages(decided.value)).toEqual([]);
  });
});
