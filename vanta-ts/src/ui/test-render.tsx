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
