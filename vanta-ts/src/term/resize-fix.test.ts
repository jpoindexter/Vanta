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

/** EventEmitter with mutable dimensions to simulate terminal resize events. */
function fakeStdout(columns: number, rows = 24): EventEmitter & { columns: number; rows: number } {
  return Object.assign(new EventEmitter(), { columns, rows });
}

function manualScheduler(): {
  schedule: (repaint: () => void) => () => void;
  flush: () => void;
} {
  let pending: (() => void) | null = null;
  return {
    schedule: (repaint) => {
      pending = repaint;
      return () => {
        if (pending === repaint) pending = null;
      };
    },
    flush: () => {
      const repaint = pending;
      pending = null;
      repaint?.();
    },
  };
}

class InkStdout extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  chunks: string[] = [];
  write(chunk: string): boolean { this.chunks.push(chunk); return true; }
}

describe("attachResizeRepaint", () => {
  it("force-repaints after width changes in both directions", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    const scheduler = manualScheduler();
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns" | "rows">, ink, scheduler.schedule);
    stdout.columns = 80; stdout.emit("resize"); scheduler.flush();
    stdout.columns = 120; stdout.emit("resize"); scheduler.flush();
    stdout.columns = 90; stdout.emit("resize"); scheduler.flush();
    const renders = ink.calls.filter((c) => c.startsWith("render@"));
    expect(renders).toHaveLength(3);
  });

  it("force-repaints after a height-only resize", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    const scheduler = manualScheduler();
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns" | "rows">, ink, scheduler.schedule);
    stdout.rows = 40;
    stdout.emit("resize");
    scheduler.flush();
    const renders = ink.calls.filter((c) => c.startsWith("render@"));
    expect(renders).toHaveLength(1);
  });

  it("coalesces a resize storm into one repaint at the settled dimensions", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    const scheduler = manualScheduler();
    attachResizeRepaint(stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns" | "rows">, ink, scheduler.schedule);
    stdout.columns = 60; stdout.rows = 20; stdout.emit("resize");
    stdout.columns = 140; stdout.rows = 45; stdout.emit("resize");
    stdout.columns = 78; stdout.rows = 25; stdout.emit("resize");
    scheduler.flush();
    expect(ink.calls.filter((c) => c.startsWith("render@"))).toHaveLength(1);
  });

  it("returns a cleanup that removes the listener and cancels a pending repaint", () => {
    const ink = fakeInk();
    const stdout = fakeStdout(100);
    const scheduler = manualScheduler();
    const detach = attachResizeRepaint(
      stdout as unknown as Pick<NodeJS.WriteStream, "on" | "off" | "columns" | "rows">,
      ink,
      scheduler.schedule,
    );
    expect(stdout.listenerCount("resize")).toBe(1);
    stdout.columns = 80;
    stdout.emit("resize");
    detach();
    expect(stdout.listenerCount("resize")).toBe(0);
    scheduler.flush();
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

  it("emits Ink's absolute clear after the resized layout settles", async () => {
    const stdout = new InkStdout();
    const stdin = Object.assign(new EventEmitter(), { isTTY: false });
    const instance = render(h(Text, null, "ready"), {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
    });
    const detach = await installResizeGhostFix(stdout as unknown as NodeJS.WriteStream);
    stdout.chunks = [];
    stdout.columns = 78;
    stdout.rows = 25;
    stdout.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(stdout.chunks.join("")).toContain("\u001b[2J\u001b[3J\u001b[H");
    detach();
    instance.unmount();
  });
});
