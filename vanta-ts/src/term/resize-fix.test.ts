import { EventEmitter } from "node:events";
import { createElement as h } from "react";
import { Text, render } from "ink";
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

/** EventEmitter with a mutable `columns` to simulate terminal width changes. */
function fakeStdout(columns: number): EventEmitter & { columns: number } {
  return Object.assign(new EventEmitter(), { columns });
}

class InkStdout extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  write(): boolean { return true; }
}

describe("attachResizeRepaint", () => {
  it("force-repaints on every WIDTH change (both grow and shrink)", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns">, ink);
    stdout.columns = 80; stdout.emit("resize"); // shrink
    stdout.columns = 120; stdout.emit("resize"); // grow
    stdout.columns = 90; stdout.emit("resize"); // shrink
    const renders = ink.calls.filter((c) => c.startsWith("render@"));
    expect(renders).toHaveLength(3); // one absolute repaint per width change
  });

  it("does NOT repaint on a height-only resize (no rewrap, no ghost — keeps bottom-anchor)", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns">, ink);
    stdout.emit("resize"); // height changed, width unchanged
    stdout.emit("resize");
    const renders = ink.calls.filter((c) => c.startsWith("render@"));
    expect(renders).toHaveLength(0);
  });

  it("returns a cleanup that removes the resize listener", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    const detach = attachResizeRepaint(
      stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns">,
      ink,
    );
    expect(stdout.listenerCount("resize")).toBe(1);
    detach();
    expect(stdout.listenerCount("resize")).toBe(0);
    stdout.columns = 80;
    stdout.emit("resize");
    expect(ink.calls.filter((c) => c.startsWith("render@"))).toHaveLength(0);
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
    const detach = await installResizeGhostFix(stream as unknown as NodeJS.WriteStream);
    expect(detach).toBeTypeOf("function");
    detach();
    expect(stream.listenerCount("resize")).toBe(0);
  });

  it("finds Ink's live instance when installed after render", async () => {
    const stdout = new InkStdout();
    const stdin = Object.assign(new EventEmitter(), { isTTY: false });
    const instance = render(h(Text, null, "ready"), {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
    });
    const before = stdout.listenerCount("resize");
    const detach = await installResizeGhostFix(stdout as unknown as NodeJS.WriteStream);
    expect(stdout.listenerCount("resize")).toBe(before + 1);
    detach();
    expect(stdout.listenerCount("resize")).toBe(before);
    instance.unmount();
  });
});
