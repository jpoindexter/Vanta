import { render } from "ink";
import type { ReactElement } from "react";
import { EventEmitter } from "node:events";

// Minimal frame-capture harness for the v2 UI on real Ink. A fake stdin reports
// raw-mode support so components using useInput mount cleanly in tests (no TTY).

class FakeStdin extends EventEmitter {
  isTTY = true;
  setRawMode(): void {}
  setEncoding(): void {}
  read(): null { return null; }
  resume(): void {}
  pause(): void {}
}

export type UiTestInstance = { lastFrame: () => string; unmount: () => void };

/** Let real Ink flush its first paint (it writes on the next tick, not sync). */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

export function renderUi(tree: ReactElement): UiTestInstance {
  const frames: string[] = [];
  const stdout = { write: (s: string) => void frames.push(s), isTTY: true, columns: 80, rows: 24, on() {}, off() {}, removeListener() {} };
  const instance = render(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  // Real Ink splits a frame across several writes (cursor moves + content), so
  // join all writes and strip ANSI — fine for contains-assertions on output.
  return {
    lastFrame: () => frames.join("").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ""),
    unmount: () => instance.unmount(),
  };
}
