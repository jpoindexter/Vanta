import { describe, expect, it } from "vitest";
import { makeInitialState, turnCompletionState } from "./turn-state.js";

describe("turn completion truth", () => {
  it("requires every executed WorkItem to be verified", () => {
    const state = makeInitialState();
    state.workItemStates.push("verified", "verified");
    expect(turnCompletionState(state, "done")).toBe("verified");

    state.workItemStates.push("unverified");
    expect(turnCompletionState(state, "done")).toBe("unverified");
  });

  it("does not turn prose-only or interrupted turns into accomplishment evidence", () => {
    expect(turnCompletionState(makeInitialState(), "done")).toBe("unverified");

    const state = makeInitialState();
    state.workItemStates.push("verified");
    expect(turnCompletionState(state, "interrupted")).toBe("stopped");
  });
});
