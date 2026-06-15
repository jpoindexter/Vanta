import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import { attachResizeRepaint, forceFullRepaint, isInkInternals, installResizeGhostFix, type InkInternals } from "./resize-fix.js";

// Regression coverage for the resize-ghosting fix. The end-to-end proof (a real
// terminal rewrapping displayed lines) lives in scripts/ghost-storm.sh, which
// needs tmux; here we lock the MECHANISM: on resize we force Ink's absolute-clear
// path by setting lastOutputHeight huge before onRender, so the order/values are
// exactly what Ink's shouldClearTerminalForFrame() needs to clear.

function fakeInk(): InkInternals & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    lastOutputHeight: 1,
    calculateLayout() { calls.push("layout"); },
    onRender() { calls.push(`render@${this.lastOutputHeight}`); },
  };
}

describe("forceFullRepaint", () => {
  it("recomputes layout, sets lastOutputHeight huge, then renders (in that order)", () => {
    const ink = fakeInk();
    forceFullRepaint(ink);
    // layout first, then onRender — and onRender must SEE the huge height so Ink
    // takes the absolute-clear (wasOverflowing) branch.
    expect(ink.calls).toEqual(["layout", `render@${Number.MAX_SAFE_INTEGER}`]);
  });
});

describe("attachResizeRepaint", () => {
  it("force-repaints on every resize event (both grow and shrink)", () => {
    const ink = fakeInk();
    const stdout = new EventEmitter();
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on">, ink);
    stdout.emit("resize"); // shrink
    stdout.emit("resize"); // grow
    stdout.emit("resize"); // shrink
    const renders = ink.calls.filter((c) => c.startsWith("render@"));
    expect(renders).toHaveLength(3); // one absolute repaint per resize
  });
});

describe("isInkInternals guard", () => {
  it("accepts an object with the three driven members", () => {
    expect(isInkInternals(fakeInk())).toBe(true);
  });
  it("rejects shapes missing any member (Ink internals changed → no-op)", () => {
    expect(isInkInternals(null)).toBe(false);
    expect(isInkInternals({})).toBe(false);
    expect(isInkInternals({ onRender() {}, calculateLayout() {} })).toBe(false); // no lastOutputHeight
    expect(isInkInternals({ onRender() {}, lastOutputHeight: 1 })).toBe(false); // no calculateLayout
  });
});

describe("installResizeGhostFix", () => {
  it("is a no-op on a non-TTY stream (never throws)", async () => {
    const stream = Object.assign(new EventEmitter(), { isTTY: false });
    await expect(installResizeGhostFix(stream as unknown as NodeJS.WriteStream)).resolves.toBeUndefined();
    expect(stream.listenerCount("resize")).toBe(0);
  });
});
