import { describe, it, expect } from "vitest";
import { formatGoalLedger } from "./goal-ledger.js";

describe("formatGoalLedger", () => {
  it("lists active goals (●) before done (✓), with id + status", () => {
    const out = formatGoalLedger([
      { id: 1, text: "old thing", status: "done" },
      { id: 2, text: "current thing", status: "active" },
    ]);
    const rows = out.split("\n");
    expect(rows[0]).toContain("Goal ledger");
    expect(rows[1]).toContain("● current thing");
    expect(rows[1]).toContain("active");
    expect(rows[1]).toContain("#2");
    expect(rows[2]).toContain("✓ old thing");
    expect(rows[2]).toContain("#1");
  });

  it("nudges when the ledger is empty", () => {
    expect(formatGoalLedger([])).toContain("no goals yet");
  });

  it("shows blocked_by and blocks graph state", () => {
    const out = formatGoalLedger([
      { id: 1, text: "blocker", status: "active" },
      { id: 2, text: "dependent", status: "active" },
    ], [{ blockerId: 1, dependentId: 2 }]);
    expect(out).toContain("● blocker");
    expect(out).toContain("blocks:2");
    expect(out).toContain("◌ dependent");
    expect(out).toContain("blocked_by:1");
  });

  it("keeps kernel done separate from evidence-derived WorkItem verification", () => {
    const base = {
      version: 1 as const,
      outcome: "Finish the current goal",
      source: "goal:1",
      updatedAt: "2026-08-02T12:00:00.000Z",
    };
    const unverified = formatGoalLedger(
      [{ id: 1, text: "current thing", status: "done" }],
      [],
      [{ ...base, id: "goal:1:turn:1", state: "unverified" }],
    );
    const verified = formatGoalLedger(
      [{ id: 1, text: "current thing", status: "done" }],
      [],
      [{ ...base, id: "goal:1:turn:2", state: "verified" }],
    );

    expect(unverified).toContain("done · work:unverified");
    expect(unverified).not.toContain("work:verified");
    expect(verified).toContain("done · work:verified");
  });
});
