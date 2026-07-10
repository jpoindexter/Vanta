import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_AUTONOMY_CONTRACT, decideAutonomy } from "./contract.js";
import {
  applyTrustGate,
  evaluateTrust,
  formatTrustLedger,
  loadTrustLedger,
  recordTrustOutcome,
  workflowIdForDecision,
} from "./trust.js";

describe("trust ledger autonomy", () => {
  it("blocks acts-alone until the workflow earns enough passing history", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-trust-"));
    try {
      const action = { kind: "proactive.loop.advance", summary: "advance queued loop", risk: "low" as const, source: "loop:alpha" };
      const base = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, action);
      expect(applyTrustGate(base, await loadTrustLedger(dir)).lane).toBe("queues-for-approval");

      const workflowId = workflowIdForDecision(base);
      await recordTrustOutcome(dir, { workflowId, outcome: "pass", reason: "verified fixture 1", now: new Date("2026-07-09T16:00:00.000Z") });
      await recordTrustOutcome(dir, { workflowId, outcome: "pass", reason: "verified fixture 2", now: new Date("2026-07-09T16:01:00.000Z") });
      await recordTrustOutcome(dir, { workflowId, outcome: "pass", reason: "verified fixture 3", now: new Date("2026-07-09T16:02:00.000Z") });

      const earned = applyTrustGate(base, await loadTrustLedger(dir));
      expect(earned.lane).toBe("acts-alone");
      expect(earned.trust?.tier).toBe("auto");
      expect(earned.reason).toContain("earned auto");

      const unrelated = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, { ...action, source: "loop:beta" });
      expect(applyTrustGate(unrelated, await loadTrustLedger(dir)).lane).toBe("queues-for-approval");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("demotes an auto workflow after a verifier failure and logs the reason", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-trust-"));
    try {
      const workflow = "proactive.loop.advance";
      await recordTrustOutcome(dir, { workflowId: workflow, outcome: "pass", reason: "verified 1" });
      await recordTrustOutcome(dir, { workflowId: workflow, outcome: "pass", reason: "verified 2" });
      await recordTrustOutcome(dir, { workflowId: workflow, outcome: "pass", reason: "verified 3" });
      await recordTrustOutcome(dir, { workflowId: workflow, outcome: "fail", reason: "fixture verifier failed", now: new Date("2026-07-09T16:03:00.000Z") });

      const ledger = await loadTrustLedger(dir);
      const trust = evaluateTrust(ledger, workflow);
      expect(trust.tier).toBe("queue");
      expect(trust.reason).toContain("fixture verifier failed");
      expect(formatTrustLedger(ledger)).toContain("queue");
      expect(await readFile(join(dir, "autonomy-decisions.jsonl"), "utf8")).toContain("fixture verifier failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves every outcome across concurrent writers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-trust-"));
    try {
      await Promise.all(Array.from({ length: 24 }, (_, index) => recordTrustOutcome(dir, {
        workflowId: index % 2 === 0 ? "loop:alpha" : "loop:beta",
        outcome: "pass",
        reason: `verified ${index}`,
      })));
      const ledger = await loadTrustLedger(dir);
      expect(ledger.workflows["loop:alpha"]).toMatchObject({ runs: 12, passes: 12, fails: 0 });
      expect(ledger.workflows["loop:beta"]).toMatchObject({ runs: 12, passes: 12, fails: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
