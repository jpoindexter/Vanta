import { describe, it, expect } from "vitest";
import { countWheelEvents, accumulateWheel } from "./use-mouse-wheel.js";

const UP = "\x1b[<64;10;5M";
const DOWN = "\x1b[<65;10;5M";

describe("countWheelEvents", () => {
  it("counts wheel-up and wheel-down events in a chunk", () => {
    expect(countWheelEvents(UP + DOWN + UP)).toEqual({ up: 2, down: 1 });
  });

  it("returns zeros for plain keystrokes", () => {
    expect(countWheelEvents("hello")).toEqual({ up: 0, down: 0 });
    expect(countWheelEvents("\x1b[A")).toEqual({ up: 0, down: 0 }); // arrow key
  });

  it("ignores click/drag mouse events (non-wheel buttons)", () => {
    expect(countWheelEvents("\x1b[<0;10;5M\x1b[<0;10;5m")).toEqual({ up: 0, down: 0 });
  });

  it("handles a momentum burst (trackpad) in one chunk", () => {
    expect(countWheelEvents(UP.repeat(12))).toEqual({ up: 12, down: 0 });
  });
});

describe("accumulateWheel", () => {
  it("converts 3 wheel events into 1 entry step", () => {
    expect(accumulateWheel(0, 3, 0)).toEqual({ steps: 1, acc: 0 });
    expect(accumulateWheel(0, 0, 3)).toEqual({ steps: -1, acc: 0 });
  });

  it("carries the remainder across chunks", () => {
    const a = accumulateWheel(0, 2, 0); // not enough yet
    expect(a).toEqual({ steps: 0, acc: 2 });
    const b = accumulateWheel(a.acc, 1, 0); // 3rd event completes the step
    expect(b).toEqual({ steps: 1, acc: 0 });
  });

  it("opposite directions cancel", () => {
    expect(accumulateWheel(0, 2, 2)).toEqual({ steps: 0, acc: 0 });
  });

  it("a fast flick yields multiple steps at once", () => {
    expect(accumulateWheel(0, 10, 0)).toEqual({ steps: 3, acc: 1 });
  });
});
