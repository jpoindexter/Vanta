import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adjudicateProbeResult,
  createHypothesisLedger,
  planDiscriminatingProbes,
  readHypothesisLedger,
  writeHypothesisLedger,
  type ProbeCandidate,
} from "./hypothesis.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-hypothesis-test-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

function candidates(): ProbeCandidate[] {
  return [
    {
      id: "inspect-lock",
      description: "Inspect the local lock without changing it",
      action: { type: "inspect_lock" },
      predictions: { "lock-stale": "unowned", "worker-alive": "owned" },
      sideEffect: "reversible",
      reversible: true,
      risk: "low",
      sideEffectCost: 1,
      approvalRequired: false,
    },
    {
      id: "restart-worker",
      description: "Restart the worker and inspect the lock",
      action: { type: "restart_worker" },
      predictions: { "lock-stale": "cleared", "worker-alive": "recreated" },
      sideEffect: "external",
      reversible: false,
      risk: "high",
      sideEffectCost: 40,
      approvalRequired: true,
    },
    {
      id: "read-log",
      description: "Read a log shared by both explanations",
      action: { type: "read_log" },
      predictions: { "lock-stale": "present", "worker-alive": "present" },
      sideEffect: "none",
      reversible: true,
      risk: "low",
      sideEffectCost: 0,
      approvalRequired: false,
    },
    ...[1, 2, 3].map((index): ProbeCandidate => ({
      id: `alternate-${index}`,
      description: `Alternative discriminating probe ${index}`,
      action: { type: "alternate", index },
      predictions: { "lock-stale": `left-${index}`, "worker-alive": `right-${index}` },
      sideEffect: "reversible",
      reversible: true,
      risk: "medium",
      sideEffectCost: 10 + index,
      approvalRequired: true,
    })),
  ];
}

describe("Schema hypothesis and probe planner", () => {
  it("persists competing hypotheses and ranks at most three discriminating probes", async () => {
    const workspace = await root();
    const ledger = createHypothesisLedger({
      taskId: "worker-recovery",
      sourceCounterexampleId: "9d6b9d6b9d6b9d6b9d6b9d6b",
      hypotheses: [
        { id: "lock-stale", description: "A stale lock blocks startup", weight: 1 },
        { id: "worker-alive", description: "A hidden worker still owns the lock", weight: 1 },
      ],
      createdAt: "2026-07-17T03:00:00.000Z",
    });

    const planned = planDiscriminatingProbes(ledger, candidates());
    expect(planned.probes).toHaveLength(3);
    expect(planned.probes[0]).toMatchObject({
      id: "inspect-lock",
      informationGain: 1,
      sideEffect: "reversible",
      risk: "low",
    });
    expect(planned.probes.map((probe) => probe.id)).not.toContain("read-log");
    expect(planned.ledger.plannedProbes[0]?.predictions).toEqual({ "lock-stale": "unowned", "worker-alive": "owned" });

    await writeHypothesisLedger(workspace, planned.ledger);
    expect(await readHypothesisLedger(workspace, ledger.id)).toEqual(planned.ledger);
  });

  it("records evidence, rejects the falsified explanation, and keeps support provisional", () => {
    const ledger = createHypothesisLedger({
      taskId: "worker-recovery",
      hypotheses: [
        { id: "lock-stale", description: "A stale lock blocks startup", weight: 1 },
        { id: "worker-alive", description: "A hidden worker still owns the lock", weight: 1 },
      ],
      createdAt: "2026-07-17T03:00:00.000Z",
    });
    const planned = planDiscriminatingProbes(ledger, candidates());
    const result = adjudicateProbeResult(planned.ledger, {
      probeId: "inspect-lock",
      transitionId: "run-probe:7",
      evidence: { available: true, outcome: "unowned" },
      recordedAt: "2026-07-17T03:05:00.000Z",
    });

    expect(result.outcome).toBe("discriminating");
    expect(result.ledger.hypotheses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "lock-stale", status: "active", supportingTransitionIds: ["run-probe:7"], refutingTransitionIds: [] }),
      expect.objectContaining({ id: "worker-alive", status: "rejected", supportingTransitionIds: [], refutingTransitionIds: ["run-probe:7"] }),
    ]));
  });

  it("does not treat missing evidence as confirmation", () => {
    const ledger = createHypothesisLedger({
      taskId: "worker-recovery",
      hypotheses: [
        { id: "lock-stale", description: "A stale lock blocks startup", weight: 1 },
        { id: "worker-alive", description: "A hidden worker still owns the lock", weight: 1 },
      ],
      createdAt: "2026-07-17T03:00:00.000Z",
    });
    const planned = planDiscriminatingProbes(ledger, candidates());
    const result = adjudicateProbeResult(planned.ledger, {
      probeId: "inspect-lock",
      transitionId: "run-probe:8",
      evidence: { available: false, reason: "adapter timed out" },
      recordedAt: "2026-07-17T03:05:00.000Z",
    });

    expect(result.outcome).toBe("inconclusive");
    expect(result.ledger.hypotheses.every((hypothesis) => hypothesis.status === "active")).toBe(true);
    expect(result.ledger.hypotheses.every((hypothesis) => hypothesis.supportingTransitionIds.length === 0)).toBe(true);
  });
});
