import { describe, it, expect, beforeEach } from "vitest";
import { autoApproveOverridden, recordAutoDecision, decisionRoute, drainDecisions, peekDecisions, summarizeDecisions } from "./decision-log.js";

// DECISION-CLASSIFIER wiring — the gate guard + the final-gate batch log.

beforeEach(() => {
  drainDecisions(); // isolate the module-level log per test
});

describe("autoApproveOverridden (the gate guard)", () => {
  it("forces the prompt when the action overrides the operator's stated direction", () => {
    // stated: keep the legacy API. action: remove it → user-challenge.
    expect(autoApproveOverridden("remove the legacy API endpoint", "keep the legacy API working")).toBe(true);
  });

  it("does NOT force a prompt for a mechanical or taste decision (grant may auto-approve)", () => {
    expect(autoApproveOverridden("fix the import path syntax error", "ship the feature")).toBe(false);
    expect(autoApproveOverridden("choose the button color", "ship the feature")).toBe(false);
  });

  it("with no stated direction, nothing is a user-challenge (grant stands)", () => {
    expect(autoApproveOverridden("delete the config file", undefined)).toBe(false);
  });

  it("does NOT log on its own — logging happens on the auto-approve branch (recordAutoDecision)", () => {
    autoApproveOverridden("pick the naming for the new field", "ship it");
    expect(peekDecisions()).toHaveLength(0);
  });
});

describe("recordAutoDecision (auto-approve branch)", () => {
  it("logs a taste auto-decision but not a mechanical one", () => {
    recordAutoDecision("pick the naming for the new field", "ship it");
    recordAutoDecision("fix the exact enum value required by the spec", "ship it");
    const logged = peekDecisions();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ class: "taste" });
    expect(logged[0]?.action).toContain("naming");
  });
});

describe("decisionRoute", () => {
  it("maps each class to its route", () => {
    expect(decisionRoute("remove the feature", "keep the feature")).toMatchObject({ alwaysAsk: true, autoDecide: false });
    expect(decisionRoute("pick the copy wording", "ship")).toMatchObject({ autoDecide: true, surfaceAtFinalGate: true });
    expect(decisionRoute("fix the typo", "ship")).toMatchObject({ autoDecide: true, surfaceAtFinalGate: false });
  });
});

describe("drainDecisions / summarizeDecisions", () => {
  it("drain returns and clears the batch", () => {
    recordAutoDecision("choose the layout order", "ship");
    expect(drainDecisions()).toHaveLength(1);
    expect(peekDecisions()).toHaveLength(0); // drained
  });

  it("summarizes a non-empty batch and returns null when empty", () => {
    expect(summarizeDecisions([])).toBeNull();
    recordAutoDecision("pick the tone of the error copy", "ship");
    const summary = summarizeDecisions(peekDecisions());
    expect(summary).toContain("1 taste decision");
    expect(summary).toContain("tone of the error copy");
  });
});
