import { describe, it, expect } from "vitest";
import {
  parsePlanSteps,
  formatPlanApproval,
  resolvePlanDecision,
  isPlanMessage,
} from "./plan-approval.js";
import { PLAN_MARKER } from "./plan-mode.js";

const ESC = String.fromCharCode(0x1b); // C0 control char, built without a literal byte in source
const NUL = String.fromCharCode(0x00);

describe("parsePlanSteps", () => {
  it("extracts numbered steps, dropping the markers", () => {
    const text = "Here is the plan:\n1. Read the file\n2. Edit the export\n3. Run tests";
    expect(parsePlanSteps(text)).toEqual(["Read the file", "Edit the export", "Run tests"]);
  });

  it("extracts bulleted steps (-, *, •)", () => {
    const text = "- first thing\n* second thing\n• third thing";
    expect(parsePlanSteps(text)).toEqual(["first thing", "second thing", "third thing"]);
  });

  it("handles `1)` paren-style numbering", () => {
    expect(parsePlanSteps("1) alpha\n2) beta")).toEqual(["alpha", "beta"]);
  });

  it("falls back to non-empty lines when there are no list markers", () => {
    const text = "do the first thing\n\ndo the second thing";
    expect(parsePlanSteps(text)).toEqual(["do the first thing", "do the second thing"]);
  });

  it("drops plan scaffolding (heading / marker) from the line fallback", () => {
    const text = `Plan\n${PLAN_MARKER}\n# heading\nactual step one`;
    expect(parsePlanSteps(text)).toEqual(["actual step one"]);
  });

  it("returns [] for empty / whitespace-only input", () => {
    expect(parsePlanSteps("")).toEqual([]);
    expect(parsePlanSteps("   \n  \n")).toEqual([]);
  });

  it("control-strips and collapses whitespace in each step", () => {
    const text = `1. read${NUL}the file\n2.   spaced    out  `;
    // The NUL is replaced with a space, then runs of whitespace collapse to one.
    expect(parsePlanSteps(text)).toEqual(["read the file", "spaced out"]);
  });

  it("strips an embedded ANSI/ESC sequence from a step", () => {
    const text = `1. ${ESC}[31mred${ESC}[0m step`;
    expect(parsePlanSteps(text)).toEqual(["[31mred [0m step"]);
  });
});

describe("formatPlanApproval", () => {
  it("numbers the steps, shows the count and the affordance", () => {
    const out = formatPlanApproval(["read", "edit", "test"]);
    expect(out).toBe(
      "▸ Plan (3 steps):\n  1. read\n  2. edit\n  3. test\n[a]pprove · [e]dit · [r]eject",
    );
  });

  it("singularizes the count for one step", () => {
    expect(formatPlanApproval(["only step"])).toContain("▸ Plan (1 step):");
  });

  it("still renders an affordance for an empty plan", () => {
    const out = formatPlanApproval([]);
    expect(out).toBe("▸ Plan (0 steps):\n[a]pprove · [e]dit · [r]eject");
  });
});

describe("resolvePlanDecision", () => {
  it("maps a / Enter to approve", () => {
    expect(resolvePlanDecision("a")).toBe("approve");
    expect(resolvePlanDecision("A")).toBe("approve");
    expect(resolvePlanDecision("enter")).toBe("approve");
    expect(resolvePlanDecision("\r")).toBe("approve");
  });

  it("maps e to edit", () => {
    expect(resolvePlanDecision("e")).toBe("edit");
    expect(resolvePlanDecision("E")).toBe("edit");
  });

  it("maps r / Escape to reject", () => {
    expect(resolvePlanDecision("r")).toBe("reject");
    expect(resolvePlanDecision("escape")).toBe("reject");
    expect(resolvePlanDecision(ESC)).toBe("reject");
  });

  it("returns null for unmapped keys", () => {
    expect(resolvePlanDecision("z")).toBeNull();
    expect(resolvePlanDecision("")).toBeNull();
    expect(resolvePlanDecision(" ")).toBeNull();
  });
});

describe("isPlanMessage", () => {
  it("is true when the plan marker is present", () => {
    expect(isPlanMessage(`${PLAN_MARKER}\nanything`)).toBe(true);
  });

  it("is true for a multi-step numbered list", () => {
    expect(isPlanMessage("1. step one\n2. step two")).toBe(true);
  });

  it("is false for a plain single-line reply", () => {
    expect(isPlanMessage("Sure, the file is at src/foo.ts.")).toBe(false);
  });

  it("is false for an empty message", () => {
    expect(isPlanMessage("")).toBe(false);
  });

  it("is false for a single step with no marker (not plan-shaped)", () => {
    expect(isPlanMessage("1. just do this one thing")).toBe(false);
  });
});
