import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMaximizer, summarizeRun, type DelegateResult, type MaximizerDeps } from "./runtime.js";
import { appendActivity, readActivity, formatTrail, trailPath, type Activity } from "./trail.js";

/** A fake delegate that returns canned per-task results and records the call order. */
function fakeDelegate(results: Record<string, DelegateResult>, calls: string[]): MaximizerDeps["delegate"] {
  return async (task: string) => {
    calls.push(task);
    return results[task] ?? { ok: true, summary: `did ${task}`, costUsd: 0.1 };
  };
}

/** Deps with an in-memory trail + an injected, mutable spend counter. */
function makeDeps(
  delegate: MaximizerDeps["delegate"],
  spendRef: { value: number },
  trail: Activity[],
  clock = 1_000,
): MaximizerDeps {
  return {
    delegate,
    recordActivity: async (entry) => {
      trail.push(entry);
    },
    now: () => clock,
    spendSoFar: () => spendRef.value,
  };
}

describe("runMaximizer", () => {
  it("delegates multiple tasks to completion with one verified trail entry each", async () => {
    const calls: string[] = [];
    const trail: Activity[] = [];
    const spend = { value: 0 };
    const delegate = fakeDelegate(
      {
        "task A": { ok: true, summary: "A done", costUsd: 0.2 },
        "task B": { ok: true, summary: "B done", costUsd: 0.3 },
      },
      calls,
    );

    const run = await runMaximizer({ tasks: ["task A", "task B"], budgetUsd: 5, deps: makeDeps(delegate, spend, trail) });

    expect(calls).toEqual(["task A", "task B"]);
    expect(run.stoppedReason).toBe("done");
    expect(run.completed).toHaveLength(2);
    expect(run.completed.every((o) => o.ok)).toBe(true);
    // Verified outcomes carry the delegate summary.
    expect(run.completed[0]).toMatchObject({ task: "task A", ok: true, summary: "A done" });
    // One activity entry per task, with a timestamp.
    expect(run.trail).toHaveLength(2);
    expect(trail).toHaveLength(2);
    expect(trail[1]).toMatchObject({ task: "task B", ok: true, ts: 1_000 });
  });

  it("accumulates cost across delegated tasks", async () => {
    const trail: Activity[] = [];
    const spend = { value: 0 };
    const delegate = fakeDelegate(
      {
        one: { ok: true, summary: "", costUsd: 0.25 },
        two: { ok: true, summary: "", costUsd: 0.75 },
      },
      [],
    );

    const run = await runMaximizer({ tasks: ["one", "two"], budgetUsd: 10, deps: makeDeps(delegate, spend, trail) });

    expect(run.totalCostUsd).toBeCloseTo(1.0, 5);
  });

  it("STOPS mid-run when the hard budget is reached — later tasks are not delegated", async () => {
    const calls: string[] = [];
    const trail: Activity[] = [];
    // Spend reflects what each delegated task cost: $3 each. Budget is $5.
    const spend = { value: 0 };
    const delegate: MaximizerDeps["delegate"] = async (task) => {
      calls.push(task);
      spend.value += 3; // simulate the spend landing against the run's budget
      return { ok: true, summary: `${task} ok`, costUsd: 3 };
    };

    const run = await runMaximizer({
      tasks: ["t1", "t2", "t3"],
      budgetUsd: 5,
      deps: makeDeps(delegate, spend, trail),
    });

    // t1 runs (spend 0 < 5). After t1, spend = 3 < 5 → t2 runs. After t2, spend
    // = 6 ≥ 5 → t3 is GATED OUT before delegating.
    expect(calls).toEqual(["t1", "t2"]);
    expect(run.completed.map((o) => o.task)).toEqual(["t1", "t2"]);
    expect(run.stoppedReason).toBe("budget");
    expect(run.trail).toHaveLength(2);
  });

  it("stops on the FIRST task when spend already meets the budget (gate runs before delegate)", async () => {
    const calls: string[] = [];
    const trail: Activity[] = [];
    const spend = { value: 5 }; // already at the limit
    const delegate = fakeDelegate({}, calls);

    const run = await runMaximizer({ tasks: ["x"], budgetUsd: 5, deps: makeDeps(delegate, spend, trail) });

    expect(calls).toEqual([]); // never delegated
    expect(run.completed).toHaveLength(0);
    expect(run.stoppedReason).toBe("budget");
  });

  it("surfaces a failed (unverified) outcome without halting the run", async () => {
    const trail: Activity[] = [];
    const spend = { value: 0 };
    const delegate = fakeDelegate(
      {
        good: { ok: true, summary: "ok", costUsd: 0.1 },
        bad: { ok: false, summary: "could not verify", costUsd: 0.1 },
      },
      [],
    );

    const run = await runMaximizer({ tasks: ["good", "bad"], budgetUsd: 5, deps: makeDeps(delegate, spend, trail) });

    expect(run.stoppedReason).toBe("done");
    expect(run.completed.map((o) => o.ok)).toEqual([true, false]);
    expect(run.completed[1]!.summary).toBe("could not verify");
  });

  it("summarizeRun renders verified count, cost, and stop reason", async () => {
    const trail: Activity[] = [];
    const spend = { value: 0 };
    const delegate = fakeDelegate({ a: { ok: true, summary: "", costUsd: 0.5 } }, []);
    const run = await runMaximizer({ tasks: ["a"], budgetUsd: 5, deps: makeDeps(delegate, spend, trail) });
    expect(summarizeRun(run)).toContain("1/1 tasks verified");
    expect(summarizeRun(run)).toContain("$0.50");
    expect(summarizeRun(run)).toContain("done");
  });
});

describe("maximizer trail store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-max-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips activity entries through a JSONL file (one per task)", async () => {
    const file = trailPath(dir, "run-1");
    const entries: Activity[] = [
      { task: "build", ok: true, costUsd: 0.4, summary: "built it", ts: 1 },
      { task: "test", ok: false, costUsd: 0.2, summary: "1 failing", ts: 2 },
    ];
    for (const e of entries) await appendActivity(file, e);

    const read = await readActivity(file);
    expect(read).toEqual(entries);
  });

  it("readActivity returns [] for a missing file (tolerant)", async () => {
    const read = await readActivity(trailPath(dir, "never-written"));
    expect(read).toEqual([]);
  });

  it("formatTrail renders a visible numbered trail with marks and cost", () => {
    const rendered = formatTrail([
      { task: "ship", ok: true, costUsd: 1.5, summary: "shipped", ts: 1 },
      { task: "verify", ok: false, costUsd: 0.5, summary: "", ts: 2 },
    ]);
    expect(rendered).toContain("1. ✓ ship ($1.50) — shipped");
    expect(rendered).toContain("2. ✗ verify ($0.50)");
  });

  it("formatTrail handles an empty trail", () => {
    expect(formatTrail([])).toBe("(no activity)");
  });
});
