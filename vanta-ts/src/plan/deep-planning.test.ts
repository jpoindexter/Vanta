import { describe, expect, it } from "vitest";
import {
  approveDeepPlan,
  createDeepPlan,
  formatDeepPlanLine,
  persistDeepPlan,
  readDeepPlans,
  requestPlanRevision,
  reviseDeepPlan,
  startDeepPlan,
  writeDeepPlans,
  type DeepPlan,
  type DeepPlanFs,
} from "./deep-planning.js";

const NOW = new Date("2026-07-09T20:00:00.000Z");
const LATER = new Date("2026-07-09T21:00:00.000Z");
const ENV = { VANTA_HOME: "/tmp/vanta-deep-plan", VANTA_PLANS_DIR: "/tmp/vanta-deep-plan/docs" } as NodeJS.ProcessEnv;

function memFs(): { fs: DeepPlanFs; files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      readFile: async (path) => {
        const value = files.get(path);
        if (value === undefined) throw new Error("ENOENT");
        return value;
      },
      writeFile: async (path, data) => void files.set(path, data),
      mkdir: async () => {},
    },
  };
}

function one(task = "Design the enterprise rollout"): DeepPlan {
  const result = createDeepPlan(task, [], NOW, ENV);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("deep planning model", () => {
  it("creates a revisionable draft plan doc for a strategy task", () => {
    const plan = one();
    expect(plan.status).toBe("draft");
    expect(plan.revisions).toHaveLength(1);
    expect(plan.docPath).toBe("/tmp/vanta-deep-plan/docs/plan-design-the-enterprise-rollout-1.md");
    expect(formatDeepPlanLine(plan)).toContain("draft · rev 1");
  });

  it("records requested revisions and appends a new revision", () => {
    const plan = one();
    const requested = requestPlanRevision(plan.id, "Need rollout risks", [plan], LATER);
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error(requested.error);
    expect(requested.value[0]?.status).toBe("revision_requested");
    expect(requested.value[0]?.reviewNote).toBe("Need rollout risks");

    const revised = reviseDeepPlan(plan.id, "## Objective\nUpdated plan with risks", requested.value, LATER);
    expect(revised.ok).toBe(true);
    if (!revised.ok) throw new Error(revised.error);
    expect(revised.value[0]?.status).toBe("draft");
    expect(revised.value[0]?.revisions.map((r) => r.rev)).toEqual([1, 2]);
  });

  it("blocks execution until the plan is approved", () => {
    const plan = one();
    const blocked = startDeepPlan(plan.id, [plan], LATER);
    expect(blocked).toEqual({ ok: false, error: `plan "${plan.id}" is draft; approve it before execution starts` });

    const approved = approveDeepPlan(plan.id, [plan], LATER);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error(approved.error);
    const started = startDeepPlan(plan.id, approved.value, LATER);
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.error);
    expect(started.value[0]?.status).toBe("started");
  });
});

describe("deep planning store", () => {
  it("round-trips the index and writes the markdown doc", async () => {
    const { fs, files } = memFs();
    const plan = one();
    await writeDeepPlans([plan], ENV, fs);
    await persistDeepPlan(plan, ENV, fs);
    expect(await readDeepPlans(ENV, fs)).toEqual([plan]);
    expect(files.get(plan.docPath)).toContain("Execution is blocked until this plan is approved.");
  });

  it("drops malformed rows and tolerates missing/corrupt stores", async () => {
    const { fs, files } = memFs();
    expect(await readDeepPlans(ENV, fs)).toEqual([]);
    files.set("/tmp/vanta-deep-plan/deep-plans.json", "{ nope");
    expect(await readDeepPlans(ENV, fs)).toEqual([]);
    files.set("/tmp/vanta-deep-plan/deep-plans.json", JSON.stringify({ version: 1, plans: [one(), { id: "" }] }));
    expect(await readDeepPlans(ENV, fs)).toHaveLength(1);
  });
});
