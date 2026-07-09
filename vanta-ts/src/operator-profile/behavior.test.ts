import { describe, expect, it } from "vitest";
import { addBeliefToStore, evidence, type BeliefStore } from "./beliefs.js";
import { behaviorPolicyScore, deriveBehaviorPolicy, formatBeliefPrompt } from "./behavior.js";

const NOW = new Date("2026-07-10T10:00:00.000Z");

function modeledStore() {
  const store: BeliefStore = { version: 1, beliefs: [] };
  const statements = [
    ["Keep answers concise", "communication"],
    ["Give me one recommendation at a time", "workflow"],
    ["Break work into tiny steps", "workflow"],
    ["Proceed through reversible work without asking", "autonomy"],
  ] as const;
  statements.forEach(([statement, facet], index) => addBeliefToStore(store, {
    statement,
    facet,
    status: "accepted",
    confidence: 1,
    evidence: evidence({ kind: "self_report", sourceRef: `session:s1:turn:${index + 1}`, excerpt: statement }, NOW),
  }, { now: NOW, id: () => `belief-${index}` }));
  return store;
}

describe("belief-driven behavior", () => {
  it("measurably changes all expected response-policy dimensions", () => {
    const expected = { detail: "concise", choiceLimit: 1, stepSize: "small", initiative: "proactive" } as const;
    const baseline = behaviorPolicyScore(deriveBehaviorPolicy([]), expected);
    const modeled = behaviorPolicyScore(deriveBehaviorPolicy(modeledStore().beliefs), expected);
    expect(baseline).toEqual({ matched: 0, total: 4 });
    expect(modeled).toEqual({ matched: 4, total: 4 });
  });

  it("injects active beliefs, behavior cues, and source provenance", () => {
    const prompt = formatBeliefPrompt(modeledStore());
    expect(prompt).toContain("Operator beliefs");
    expect(prompt).toContain("Present one recommended action at a time");
    expect(prompt).toContain("session:s1:turn:2");
    expect(prompt).toContain("corrections override inferences");
  });

  it("does not inject rejected beliefs", () => {
    const store = modeledStore();
    store.beliefs[0]!.status = "rejected";
    expect(formatBeliefPrompt(store)).not.toContain("Keep answers concise");
  });

  it("lets the newest equal-confidence belief determine conflicting behavior", () => {
    const store = modeledStore();
    addBeliefToStore(store, {
      statement: "Use detailed answers by default",
      facet: "communication",
      status: "accepted",
      confidence: 1,
      evidence: evidence({ kind: "self_report", sourceRef: "session:s2:turn:1", excerpt: "Use detailed answers by default" }, new Date("2026-07-11T10:00:00.000Z")),
    }, { now: new Date("2026-07-11T10:00:00.000Z"), id: () => "new-detail" });
    expect(deriveBehaviorPolicy(store.beliefs).detail).toBe("detailed");
  });
});
