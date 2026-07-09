import { describe, expect, it } from "vitest";
import { handleDeepPlan, type DeepPlanDeps } from "./deep-plan-cmd.js";
import type { DeepPlan } from "../plan/deep-planning.js";

const ENV = { VANTA_HOME: "/tmp/vanta-deep-cli", VANTA_PLANS_DIR: "/tmp/vanta-deep-cli/docs" } as NodeJS.ProcessEnv;
const NOW = new Date("2026-07-09T20:00:00.000Z");

function deps(): DeepPlanDeps & { plans: DeepPlan[]; docs: Map<string, string>; lines: string[] } {
  const docs = new Map<string, string>();
  const lines: string[] = [];
  let plans: DeepPlan[] = [];
  const d = {
    get plans() { return plans; },
    docs,
    lines,
    read: async () => plans,
    write: async (next: DeepPlan[]) => { plans = next; },
    persist: async (plan: DeepPlan) => { docs.set(plan.docPath, plan.status); },
    env: ENV,
    now: () => NOW,
    log: (line: string) => void lines.push(line),
  };
  return d;
}

describe("deep-plan command", () => {
  it("creates a revisionable plan document", async () => {
    const d = deps();
    const code = await handleDeepPlan(["create", "Design", "enterprise", "rollout"], d);
    expect(code).toBe(0);
    expect(d.plans[0]).toMatchObject({ id: "plan-design-enterprise-rollout-1", status: "draft" });
    expect([...d.docs.keys()][0]).toBe("/tmp/vanta-deep-cli/docs/plan-design-enterprise-rollout-1.md");
    expect(d.lines.join("\n")).toContain("created plan-design-enterprise-rollout-1");
  });

  it("blocks start until approve, then allows start", async () => {
    const d = deps();
    await handleDeepPlan(["create", "Plan", "migration"], d);
    const id = d.plans[0]!.id;
    expect(await handleDeepPlan(["start", id], d)).toBe(1);
    expect(d.lines.at(-1)).toContain("approve it before execution starts");
    expect(await handleDeepPlan(["approve", id], d)).toBe(0);
    expect(await handleDeepPlan(["start", id], d)).toBe(0);
    expect(d.plans[0]?.status).toBe("started");
  });

  it("records a revision loop", async () => {
    const d = deps();
    await handleDeepPlan(["create", "Strategy"], d);
    const id = d.plans[0]!.id;
    expect(await handleDeepPlan(["request-revision", id, "Add", "risks"], d)).toBe(0);
    expect(d.plans[0]?.status).toBe("revision_requested");
    expect(await handleDeepPlan(["revise", id, "##", "Updated"], d)).toBe(0);
    expect(d.plans[0]?.status).toBe("draft");
    expect(d.plans[0]?.revisions).toHaveLength(2);
  });

  it("lists plans and prints usage", async () => {
    const d = deps();
    expect(await handleDeepPlan([], d)).toBe(0);
    expect(d.lines.join("\n")).toContain("vanta deep-plan");
    d.lines.length = 0;
    await handleDeepPlan(["create", "Strategy"], d);
    d.lines.length = 0;
    expect(await handleDeepPlan(["list"], d)).toBe(0);
    expect(d.lines.join("\n")).toContain("plan-strategy-1 · draft · rev 1");
  });
});
