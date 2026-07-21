import { describe, expect, it } from "vitest";
import type { Message } from "../types.js";
import { makeInitialState } from "./turn-state.js";
import { detectAdaptiveRedirect, detectAdaptiveSupport, injectAdaptiveSupport } from "./adaptive-support.js";

describe("detectAdaptiveSupport", () => {
  it("turns explicit activation friction into one-action support", () => {
    const plan = detectAdaptiveSupport("I'm stuck and can't start this migration", []);
    expect(plan.signals).toContain("activation");
    expect(plan.directive).toContain("smallest safe reversible action");
    expect(plan.directive).toContain("do not diagnose, label, or store");
  });

  it("combines low-bandwidth and reorientation signals", () => {
    const plan = detectAdaptiveSupport("This is too much. What's left?", []);
    expect(plan.signals).toEqual(["low-bandwidth", "reorientation"]);
    expect(plan.directive).toContain("one active action");
    expect(plan.directive).toContain("Outcome / Done / Now / Next / Blocker");
  });

  it("detects correction from recent interaction context", () => {
    const history: Message[] = [
      { role: "user", content: "Use the desktop app" },
      { role: "assistant", content: "I changed the TUI" },
    ];
    const plan = detectAdaptiveSupport("I said the desktop app, not the TUI", history);
    expect(plan.signals).toContain("correction");
    expect(plan.directive).toContain("change approach before doing more work");
  });

  it("accepts shorthand and missing apostrophes in interaction signals", () => {
    const plan = detectAdaptiveSupport("u didnt do it and now im stuck. whats left", []);
    expect(plan.signals).toEqual(["activation", "reorientation", "correction"]);
  });

  it("recognizes broad implementation work as a complex action task", () => {
    const plan = detectAdaptiveSupport("Update the whole app and test everything", []);
    expect(plan.actionRequested).toBe(true);
    expect(plan.signals).toContain("complex-task");
    expect(plan.directive).toContain("one active step");
  });

  it("does not add a private directive for an ordinary direct request", () => {
    expect(detectAdaptiveSupport("Open README.md", []).directive).toBe("");
  });
});

describe("injectAdaptiveSupport", () => {
  it("injects a private system message without mutating the transcript", () => {
    const messages: Message[] = [
      { role: "system", content: "base" },
      { role: "user", content: "I'm stuck" },
    ];
    const injected = injectAdaptiveSupport(messages, ["private directive"]);
    expect(messages).toHaveLength(2);
    expect(injected.map((message) => message.role)).toEqual(["system", "system", "user"]);
    expect(injected[1]?.content).toBe("private directive");
  });
});

describe("detectAdaptiveRedirect", () => {
  it("redirects an action task after six read-only calls", () => {
    const plan = detectAdaptiveSupport("Fix the broken setup flow", []);
    const state = makeInitialState();
    state.toolIterations = 6;
    state.toolNames.push("read_file", "grep_files", "read_file", "inspect_state", "git_diff", "read_file");
    expect(detectAdaptiveRedirect(plan, state)).toContain("only researched");
  });

  it("redirects before the hard stop when a tool call repeats", () => {
    const plan = detectAdaptiveSupport("Fix it", []);
    const state = makeInitialState();
    state.callCounts.set("read_file:{}", 2);
    expect(detectAdaptiveRedirect(plan, state)).toContain("materially different");
  });

  it("is bounded to one redirect per turn", () => {
    const plan = detectAdaptiveSupport("Fix it", []);
    const state = makeInitialState();
    state.consecutiveFailures = 2;
    state.adaptiveRedirects = 1;
    expect(detectAdaptiveRedirect(plan, state)).toBe("");
  });
});
