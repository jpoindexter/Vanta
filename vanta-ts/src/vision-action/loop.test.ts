import { describe, it, expect, vi } from "vitest";
import { visionActionStep, runVisionAction, type VisionActionDeps, type GroundedTarget, type Observation } from "./loop.js";

const obs = (shot: string): Observation => ({ shot });
const target = (over: Partial<GroundedTarget> = {}): GroundedTarget => ({ found: true, selector: "#btn", ...over });

/** A fake substrate driven by a queue of observations and a ground/changed verdict. */
function deps(over: Partial<VisionActionDeps> = {}): { deps: VisionActionDeps; act: ReturnType<typeof vi.fn> } {
  const act = vi.fn(async () => {});
  return {
    act,
    deps: {
      perceive: vi.fn(async () => obs("a")),
      ground: vi.fn(async () => target()),
      act,
      changed: () => true,
      ...over,
    },
  };
}

describe("visionActionStep", () => {
  it("returns not_found and never acts when the target isn't located", async () => {
    const { deps: d, act } = deps({ ground: async () => ({ found: false }) });
    const step = await visionActionStep("Login button", d);
    expect(step.status).toBe("not_found");
    expect(act).not.toHaveBeenCalled();
  });

  it("returns acted when the grounded action changes the screen", async () => {
    let n = 0;
    const { deps: d, act } = deps({ perceive: async () => obs(`shot-${n++}`), changed: (b, a) => b.shot !== a.shot });
    const step = await visionActionStep("Login button", d);
    expect(step.status).toBe("acted");
    expect(step.changed).toBe(true);
    expect(act).toHaveBeenCalledOnce();
    expect(step.before.shot).not.toBe(step.after?.shot);
  });

  it("detects a mis-click when the screen doesn't change after acting", async () => {
    const { deps: d, act } = deps({ changed: () => false });
    const step = await visionActionStep("Login button", d);
    expect(step.status).toBe("misclick");
    expect(act).toHaveBeenCalledOnce();
    expect(step.note).toMatch(/mis-click/);
  });
});

describe("runVisionAction", () => {
  it("succeeds on the first attempt when the action lands", async () => {
    const { deps: d } = deps();
    const r = await runVisionAction("Login", d, { maxAttempts: 3 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.steps).toHaveLength(1);
  });

  it("recovers: a mis-click then a successful re-ground", async () => {
    const changed = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { deps: d } = deps({ changed });
    const r = await runVisionAction("Login", d, { maxAttempts: 3 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.steps[0]?.status).toBe("misclick");
    expect(r.steps[1]?.status).toBe("acted");
  });

  it("fails after exhausting retries on persistent mis-clicks", async () => {
    const { deps: d } = deps({ changed: () => false });
    const r = await runVisionAction("Login", d, { maxAttempts: 2 });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
    expect(r.steps).toHaveLength(2);
    expect(r.note).toMatch(/mis-click/);
  });

  it("fails with a not-located note when the target is never found", async () => {
    const { deps: d } = deps({ ground: async () => ({ found: false }) });
    const r = await runVisionAction("Ghost", d, { maxAttempts: 2 });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/not located/);
  });

  it("clamps maxAttempts to at least 1", async () => {
    const { deps: d } = deps({ changed: () => false });
    const r = await runVisionAction("Login", d, { maxAttempts: 0 });
    expect(r.steps).toHaveLength(1);
  });
});
