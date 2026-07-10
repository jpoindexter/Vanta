import { render } from "ink";
import type { ReactElement } from "react";
import { EventEmitter } from "node:events";

// Minimal frame-capture harness for the v2 UI on real Ink. A fake stdin reports
// raw-mode support so components using useInput mount cleanly in tests (no TTY).

class FakeStdin extends EventEmitter {
  isTTY = true;
  private chunks: string[] = [];
  setRawMode(): void {}
  setEncoding(): void {}
  ref(): void {}
  unref(): void {}
  read(): string | null { return this.chunks.shift() ?? null; }
  resume(): void {}
  pause(): void {}
  writeInput(input: string): void { this.chunks.push(input); this.emit("readable"); }
}

export type UiTestInstance = { input: (s: string) => void; lastFrame: () => string; unmount: () => void };

/** Let real Ink flush its first paint (it writes on the next tick, not sync). */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/**
 * Tick until the cumulative frame output contains `substring`, returning that frame.
 * Deterministic replacement for a fixed tick count: a state-change repaint can need
 * many flush cycles, and under full-suite load a fixed count under-waits and flakes.
 * Returns as soon as the text appears (fast common case); throws with the actual
 * frame if it never does. Use for any assertion that follows an input/state change.
 */
export async function waitForFrame(inst: UiTestInstance, substring: string, maxTicks = 500): Promise<string> {
  for (let i = 0; i < maxTicks; i++) {
    const frame = inst.lastFrame();
    if (frame.includes(substring)) return frame;
    await tick();
  }
  const frame = inst.lastFrame();
  if (frame.includes(substring)) return frame;
  throw new Error(`waitForFrame: ${JSON.stringify(substring)} not found after ${maxTicks} ticks.\nFrame:\n${frame}`);
}

/**
 * Tick until `predicate()` is true (e.g. a spy was called after a keypress), then
 * return. Deterministic replacement for a fixed tick count before a non-frame
 * assertion: under load, input is read over several cycles and a fixed wait flakes.
 * Returns as soon as the predicate holds; throws after `maxTicks` if it never does.
 */
export async function waitUntil(predicate: () => boolean, maxTicks = 60): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    await tick();
  }
  if (predicate()) return;
  throw new Error(`waitUntil: predicate still false after ${maxTicks} ticks`);
}

export function renderUi(tree: ReactElement, opts: { cols?: number } = {}): UiTestInstance {
  const frames: string[] = [];
  const stdout = { write: (s: string) => void frames.push(s), isTTY: true, columns: opts.cols ?? 80, rows: 24, on() {}, off() {}, removeListener() {} };
  const stdin = new FakeStdin();
  const instance = render(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  // Real Ink splits a frame across several writes (cursor moves + content), so
  // join all writes and strip ANSI — fine for contains-assertions on output.
  return {
    input: (s: string) => stdin.writeInput(s),
    lastFrame: () => frames.join("").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ""),
    unmount: () => instance.unmount(),
  };
}
