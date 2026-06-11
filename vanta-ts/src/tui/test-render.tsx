import { EventEmitter } from "node:events";
import { renderSync } from "ink";
import type { ReactNode } from "react";

// Local replacement for ink-testing-library against the vendored hermes-ink
// fork: renderSync + fake stdio + a minimal terminal-grid emulator. The fork
// writes frames as synchronized updates with cursor-positioned spans (spaces
// arrive as ESC[nC moves, the cursor cell can be re-painted via ESC[nG/H), so
// naive ANSI stripping jumbles words — replaying the writes onto a grid gives
// the screen a real terminal would show.

type Grid = { rows: string[][]; r: number; c: number };

const newGrid = (): Grid => ({ rows: [[]], r: 0, c: 0 });

function put(g: Grid, ch: string): void {
  while (g.rows.length <= g.r) g.rows.push([]);
  const row = g.rows[g.r]!;
  while (row.length < g.c) row.push(" ");
  row[g.c] = ch;
  g.c++;
}

function applyCsi(g: Grid, params: string, final: string): void {
  const n = Math.max(1, parseInt(params || "1", 10) || 1);
  if (final === "C") g.c += n;
  else if (final === "D") g.c = Math.max(0, g.c - n);
  else if (final === "G") g.c = n - 1;
  else if (final === "A") g.r = Math.max(0, g.r - n);
  else if (final === "B") g.r += n;
  else if (final === "H" || final === "f") {
    const [row, col] = params.split(";").map((p) => Math.max(1, parseInt(p || "1", 10) || 1));
    g.r = (row ?? 1) - 1;
    g.c = (col ?? 1) - 1;
  } else if (final === "K") {
    const row = g.rows[g.r];
    if (row) row.length = Math.min(row.length, g.c);
  } else if (final === "J") {
    g.rows = [[]];
    g.r = 0;
    g.c = 0;
  }
  // Everything else (SGR colors, mode set/reset, cursor show/hide) is styling
  // or terminal state — no effect on the character grid.
}

const CSI_RE = /^\x1b\[([0-9;?]*)([A-Za-z@`~])/;
const OSC_RE = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/;
const ESC_SINGLE_RE = /^\x1b[^[\]]/;

/** Replay raw terminal writes onto the grid. */
function feed(g: Grid, chunk: string): void {
  let i = 0;
  while (i < chunk.length) {
    const rest = chunk.slice(i);
    const csi = CSI_RE.exec(rest);
    if (csi) { applyCsi(g, csi[1]!, csi[2]!); i += csi[0].length; continue; }
    const osc = OSC_RE.exec(rest);
    if (osc) { i += osc[0].length; continue; }
    const esc = ESC_SINGLE_RE.exec(rest);
    if (esc) { i += esc[0].length; continue; }
    const ch = chunk[i]!;
    if (ch === "\r") g.c = 0;
    else if (ch === "\n") { g.r++; g.c = 0; }
    else if (ch !== "\x1b" && ch >= " ") put(g, ch);
    i++;
  }
}

class FakeStdout extends EventEmitter {
  columns = 220;
  rows = 60;
  isTTY = true;
  frames: string[] = [];
  write(chunk: string): boolean {
    this.frames.push(chunk);
    return true;
  }
  lastFrame(): string {
    const g = newGrid();
    for (const f of this.frames) feed(g, f);
    return g.rows.map((row) => row.join("").replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
  }
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  private buf: string[] = [];
  // The fork reads in paused mode: 'readable' events + read() loops, guarded
  // by readableLength checks — mirror that surface exactly.
  get readableLength(): number {
    return this.buf.reduce((n, s) => n + s.length, 0);
  }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
  ref(): this { return this; }
  unref(): this { return this; }
  resume(): this { return this; }
  pause(): this { return this; }
  read(): string | null {
    return this.buf.shift() ?? null;
  }
  write(data: string): void {
    this.buf.push(data);
    this.emit("readable");
  }
}

export type TestInstance = {
  lastFrame: () => string;
  frames: string[];
  rerender: (tree: ReactNode) => void;
  unmount: () => void;
  stdin: FakeStdin;
};

export function render(tree: ReactNode): TestInstance {
  const stdout = new FakeStdout();
  const stderr = new FakeStdout();
  const stdin = new FakeStdin();
  const instance = renderSync(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  return {
    lastFrame: () => stdout.lastFrame(),
    frames: stdout.frames,
    rerender: instance.rerender,
    unmount: () => instance.unmount(),
    stdin,
  };
}
