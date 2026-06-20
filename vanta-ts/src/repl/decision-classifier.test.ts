import { describe, it, expect } from "vitest";
import {
  classifyDecision,
  routeDecision,
  contradictsDirection,
  buildDecisionNote,
  type DecisionClass,
} from "./decision-classifier.js";

describe("contradictsDirection", () => {
  it("flags a reversal that targets a noun the operator named", () => {
    // arrange/act/assert
    expect(contradictsDirection("skip the tests for this slice", "always ship tests in the same slice")).toBe(true);
  });

  it("is false when the action does not reverse anything", () => {
    expect(contradictsDirection("add tests for the parser", "always ship tests")).toBe(false);
  });

  it("is false when no stated direction is provided", () => {
    expect(contradictsDirection("skip the tests", undefined)).toBe(false);
    expect(contradictsDirection("skip the tests", "")).toBe(false);
  });

  it("is false when the reversal targets a noun the operator never mentioned", () => {
    expect(contradictsDirection("drop the cache layer", "use TypeScript strict mode")).toBe(false);
  });
});

describe("classifyDecision", () => {
  it("classifies overriding the operator's stated direction as user-challenge", () => {
    const cls = classifyDecision({
      action: "switch away from Postgres to MongoDB",
      statedDirection: "stack is Postgres, locked after first slice",
    });
    expect(cls).toBe("user-challenge");
  });

  it("classifies a single-correct deterministic choice as mechanical", () => {
    expect(classifyDecision({ action: "fix the import path to ./decision-classifier.js" })).toBe("mechanical");
    expect(classifyDecision({ action: "correct the type error in the signature" })).toBe("mechanical");
  });

  it("classifies a viable-alternatives choice as taste", () => {
    expect(classifyDecision({ action: "choose a name for the new module" })).toBe("taste");
    expect(classifyDecision({ action: "pick the button color and layout" })).toBe("taste");
  });

  it("prefers taste over mechanical when a choice has a judgement component", () => {
    // a rename (mechanical-looking) that is also a naming choice → taste
    expect(classifyDecision({ action: "rename and choose a clearer name for the helper" })).toBe("taste");
  });

  it("user-challenge wins even when the action also looks like taste", () => {
    const cls = classifyDecision({
      action: "replace the chosen design pattern with a different approach",
      statedDirection: "design pattern is fixed: ports and adapters",
    });
    expect(cls).toBe("user-challenge");
  });

  it("defaults an unsignalled choice to taste (surface, never silently assume)", () => {
    expect(classifyDecision({ action: "decide what to do next" })).toBe("taste");
  });
});

describe("routeDecision", () => {
  it("routes a mechanical decision to auto-decide silently", () => {
    expect(routeDecision("mechanical")).toEqual({ autoDecide: true, surfaceAtFinalGate: false, alwaysAsk: false });
  });

  it("routes a taste decision to auto-decide and surface at the final gate", () => {
    expect(routeDecision("taste")).toEqual({ autoDecide: true, surfaceAtFinalGate: true, alwaysAsk: false });
  });

  it("routes a user-challenge decision to always ask, never auto-decide", () => {
    expect(routeDecision("user-challenge")).toEqual({ autoDecide: false, surfaceAtFinalGate: false, alwaysAsk: true });
  });

  it("never auto-decides AND always-asks at the same time", () => {
    const classes: DecisionClass[] = ["mechanical", "taste", "user-challenge"];
    for (const c of classes) {
      const r = routeDecision(c);
      expect(r.autoDecide && r.alwaysAsk).toBe(false);
    }
  });
});

describe("end-to-end routing behaviors", () => {
  it("a user-challenge decision always asks the operator", () => {
    const ctx = { action: "ignore the locked stack and use a new framework", statedDirection: "stack is locked" };
    expect(routeDecision(classifyDecision(ctx)).alwaysAsk).toBe(true);
  });

  it("a mechanical decision auto-decides silently", () => {
    const route = routeDecision(classifyDecision({ action: "fix the syntax error on line 12" }));
    expect(route.autoDecide).toBe(true);
    expect(route.surfaceAtFinalGate).toBe(false);
    expect(route.alwaysAsk).toBe(false);
  });

  it("a taste decision surfaces at the final gate", () => {
    const route = routeDecision(classifyDecision({ action: "choose the wording for the empty state" }));
    expect(route.autoDecide).toBe(true);
    expect(route.surfaceAtFinalGate).toBe(true);
  });
});

describe("buildDecisionNote", () => {
  it("warns and names the operator override for a user-challenge", () => {
    const note = buildDecisionNote({
      action: "drop the agreed approach",
      statedDirection: "approach is agreed: incremental slices",
    });
    expect(note).toContain("user-challenge");
    expect(note).toMatch(/⚠/);
    expect(note).toMatch(/operator|overrides/i);
  });

  it("uses a quiet glyph for an auto-decided class", () => {
    const note = buildDecisionNote({ action: "fix the import path" });
    expect(note).toContain("mechanical");
    expect(note).toMatch(/^·/);
  });
});
