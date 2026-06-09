import { describe, it, expect } from "vitest";
import { nextMode, APPROVAL_MODES, MODE_LABEL, type ApprovalMode } from "./approval-mode.js";

describe("nextMode", () => {
  it("cycles from review to accept-edits", () => {
    expect(nextMode("review")).toBe("accept-edits");
  });

  it("cycles from accept-edits to auto", () => {
    expect(nextMode("accept-edits")).toBe("auto");
  });

  it("cycles from auto back to review", () => {
    expect(nextMode("auto")).toBe("review");
  });

  it("wraps around: applying nextMode N times returns to start", () => {
    let m: ApprovalMode = APPROVAL_MODES[0]!;
    for (let i = 0; i < APPROVAL_MODES.length; i++) m = nextMode(m);
    expect(m).toBe(APPROVAL_MODES[0]);
  });

  it("covers every mode — no mode is unreachable from review", () => {
    const visited = new Set<string>();
    let m: ApprovalMode = "review";
    do {
      visited.add(m);
      m = nextMode(m);
    } while (!visited.has(m));
    expect(visited.size).toBe(APPROVAL_MODES.length);
  });

  it("has a label for every mode in APPROVAL_MODES", () => {
    for (const m of APPROVAL_MODES) {
      expect(typeof MODE_LABEL[m]).toBe("string");
    }
  });
});
