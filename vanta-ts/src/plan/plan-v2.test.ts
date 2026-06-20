import { describe, it, expect, vi } from "vitest";
import {
  planModeV2AgentCount,
  planModeV2ExploreAgentCount,
  splitPlanSteps,
  runPlanV2,
  formatPlanV2Progress,
  type StepResult,
  type SpawnOutcome,
} from "./plan-v2.js";

describe("planModeV2AgentCount", () => {
  it("defaults to 1 when unset", () => {
    expect(planModeV2AgentCount({})).toBe(1);
  });

  it("reads VANTA_PLAN_V2_AGENT_COUNT override", () => {
    expect(planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "3" })).toBe(3);
  });

  it("accepts the legacy CLAUDE_CODE_PLAN_V2_AGENT_COUNT alias", () => {
    expect(planModeV2AgentCount({ CLAUDE_CODE_PLAN_V2_AGENT_COUNT: "5" })).toBe(5);
  });

  it("prefers the VANTA key over the legacy alias", () => {
    expect(
      planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "2", CLAUDE_CODE_PLAN_V2_AGENT_COUNT: "9" }),
    ).toBe(2);
  });

  it("clamps 0 up to 1", () => {
    expect(planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "0" })).toBe(1);
  });

  it("clamps 99 down to 10", () => {
    expect(planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "99" })).toBe(10);
  });

  it("falls back to default on a non-numeric override", () => {
    // NaN is clamped to the floor (1), never the raw garbage value.
    expect(planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "abc" })).toBe(1);
  });

  it("ignores an empty-string override and uses the default", () => {
    expect(planModeV2AgentCount({ VANTA_PLAN_V2_AGENT_COUNT: "   " })).toBe(1);
  });
});

describe("planModeV2ExploreAgentCount", () => {
  it("defaults to 3 when unset", () => {
    expect(planModeV2ExploreAgentCount({})).toBe(3);
  });

  it("reads VANTA_PLAN_V2_EXPLORE_COUNT override", () => {
    expect(planModeV2ExploreAgentCount({ VANTA_PLAN_V2_EXPLORE_COUNT: "7" })).toBe(7);
  });

  it("accepts the legacy CLAUDE_CODE_PLAN_V2_EXPLORE_COUNT alias", () => {
    expect(planModeV2ExploreAgentCount({ CLAUDE_CODE_PLAN_V2_EXPLORE_COUNT: "4" })).toBe(4);
  });

  it("clamps explore 0→1 and 99→10", () => {
    expect(planModeV2ExploreAgentCount({ VANTA_PLAN_V2_EXPLORE_COUNT: "0" })).toBe(1);
    expect(planModeV2ExploreAgentCount({ VANTA_PLAN_V2_EXPLORE_COUNT: "99" })).toBe(10);
  });
});

describe("splitPlanSteps", () => {
  it("returns exactly `count` steps for a normal task", () => {
    const steps = splitPlanSteps("build the thing", 3);
    expect(steps).toHaveLength(3);
  });

  it("returns no more than `count` steps (clamped at the 10 ceiling)", () => {
    const steps = splitPlanSteps("big task", 50);
    expect(steps.length).toBeLessThanOrEqual(10);
    expect(steps).toHaveLength(10);
  });

  it("clamps a 0 count up to 1 step", () => {
    expect(splitPlanSteps("task", 0)).toHaveLength(1);
  });

  it("returns an empty array for a blank task", () => {
    expect(splitPlanSteps("   ", 3)).toEqual([]);
  });

  it("numbers each step and embeds the task", () => {
    const steps = splitPlanSteps("refactor auth", 2);
    expect(steps[0]).toContain("Step 1 of 2");
    expect(steps[1]).toContain("Step 2 of 2");
    expect(steps[0]).toContain("refactor auth");
  });
});

/** A spawn stub that records peak concurrency, to prove Promise.all overlap. */
function countingSpawn(): { spawn: () => Promise<SpawnOutcome>; peak: () => number } {
  let active = 0;
  let maxActive = 0;
  const spawn = async (): Promise<SpawnOutcome> => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return { ok: true, summary: "ok" };
  };
  return { spawn, peak: () => maxActive };
}

describe("runPlanV2", () => {
  it("spawns exactly `count` agents concurrently and aggregates results", async () => {
    const spawn = vi.fn(async (prompt: string): Promise<SpawnOutcome> => ({
      ok: true,
      summary: `did: ${prompt.slice(0, 6)}`,
    }));

    const result = await runPlanV2({ task: "ship feature", count: 3, spawn });

    expect(spawn).toHaveBeenCalledTimes(3); // exactly `count` spawns
    expect(result.steps).toHaveLength(3); // one StepResult per agent, indexed 1..N
    expect(result.steps.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(result.steps.every((s) => s.ok)).toBe(true);
    expect(result.summary).toBe("plan v2: 3/3 step(s) succeeded");
  });

  it("runs the spawns concurrently, not serially", async () => {
    const { spawn, peak } = countingSpawn();
    await runPlanV2({ task: "parallel work", count: 4, spawn });
    expect(peak()).toBe(4); // serial would peak at 1; Promise.all overlaps them
  });

  it("captures a thrown spawn as a failed step without aborting the run", async () => {
    const spawn = async (prompt: string): Promise<SpawnOutcome> => {
      if (prompt.includes("Step 2")) throw new Error("boom");
      return { ok: true, summary: "fine" };
    };

    const result = await runPlanV2({ task: "mixed", count: 3, spawn });

    expect(result.steps).toHaveLength(3);
    expect(result.steps[1]?.ok).toBe(false);
    expect(result.steps[1]?.summary).toContain("boom");
    expect(result.summary).toBe("plan v2: 2/3 step(s) succeeded");
  });

  it("respects the agent-count default of 1 when count comes from env", async () => {
    const spawn = vi.fn(async (): Promise<SpawnOutcome> => ({ ok: true, summary: "ok" }));
    await runPlanV2({ task: "solo", count: planModeV2AgentCount({}), spawn });
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe("formatPlanV2Progress", () => {
  const steps: StepResult[] = [
    { step: 1, prompt: "p1", ok: true, summary: "done one" },
    { step: 2, prompt: "p2", ok: false, summary: "failed two" },
    { step: 3, prompt: "p3", ok: true, summary: "done three" },
  ];

  it("renders one row per agent plus a header", () => {
    const out = formatPlanV2Progress(steps);
    const lines = out.split("\n");
    // header + 3 agent rows
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("3 agent(s)");
  });

  it("renders a row for every step with its status glyph", () => {
    const out = formatPlanV2Progress(steps);
    expect(out).toContain("agent 1/3");
    expect(out).toContain("agent 2/3");
    expect(out).toContain("agent 3/3");
    expect(out).toContain("✓ agent 1/3");
    expect(out).toContain("✘ agent 2/3");
  });

  it("handles an empty step list", () => {
    expect(formatPlanV2Progress([])).toContain("no plan steps");
  });
});
