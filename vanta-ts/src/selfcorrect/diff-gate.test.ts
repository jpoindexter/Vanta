import { describe, it, expect } from "vitest";
import {
  diffGatePolicy,
  policyFor,
  isAutonomousStep,
  requiresHumanGate,
  humanGatedStep,
  nothingAutoMerges,
  decideStep,
  type SelfCorrectStep,
} from "./diff-gate.js";

describe("diff-gate: where to put the human", () => {
  it("diagnosis and drafting are autonomous (low-signal, mutate nothing)", () => {
    expect(isAutonomousStep("diagnose")).toBe(true);
    expect(isAutonomousStep("draft")).toBe(true);
    expect(requiresHumanGate("diagnose")).toBe(false);
    expect(requiresHumanGate("draft")).toBe(false);
  });

  it("the read-only confirm/rerun and the regression lock are autonomous", () => {
    expect(isAutonomousStep("confirm-failure")).toBe(true);
    expect(isAutonomousStep("rerun")).toBe(true);
    expect(isAutonomousStep("lock")).toBe(true);
  });

  it("applying the diff is the one human/kernel-gated step", () => {
    expect(requiresHumanGate("apply-diff")).toBe(true);
    expect(isAutonomousStep("apply-diff")).toBe(false);
    expect(humanGatedStep()).toBe("apply-diff");
  });

  it("apply-diff is the only step that mutates the workspace", () => {
    const mutating = diffGatePolicy().filter((p) => p.mutatesWorkspace);
    expect(mutating).toHaveLength(1);
    expect(mutating[0]!.step).toBe("apply-diff");
  });

  it("nothing auto-merges: the single mutating step is human-gated", () => {
    expect(nothingAutoMerges()).toBe(true);
  });

  it("no autonomous step ever mutates the workspace", () => {
    for (const p of diffGatePolicy()) {
      if (p.authority === "autonomous") expect(p.mutatesWorkspace).toBe(false);
    }
  });

  it("decideStep: autonomous steps proceed with no gate", () => {
    const d = decideStep("diagnose");
    expect(d).toMatchObject({ allowed: true, gate: "none" });
  });

  it("decideStep: applying the diff proceeds only behind the human gate", () => {
    const d = decideStep("apply-diff");
    expect(d).toMatchObject({ allowed: true, gate: "human" });
  });

  it("every loop step has exactly one policy entry, no duplicates", () => {
    const steps: SelfCorrectStep[] = ["confirm-failure", "diagnose", "draft", "apply-diff", "rerun", "lock"];
    const table = diffGatePolicy();
    expect(table).toHaveLength(steps.length);
    expect(new Set(table.map((p) => p.step)).size).toBe(steps.length);
    for (const s of steps) expect(policyFor(s).step).toBe(s);
  });

  it("policyFor rejects an unknown step with an actionable error", () => {
    expect(() => policyFor("merge" as SelfCorrectStep)).toThrow(/unknown self-correction step/);
  });
});
