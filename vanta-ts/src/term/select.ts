import { emitKeypressEvents, type Key } from "node:readline";

// Arrow-key single-select for the setup wizard (↑/↓ move, Enter/Space select,
// Esc back). Zero-dep raw-keypress over stdin; the render is pure and the
// input/output are injectable so the loop is unit-testable without a real TTY.

export type SelectInput = NodeJS.EventEmitter & {
  isTTY?: boolean;
  setRawMode?: (m: boolean) => void;
  resume?: () => void;
  pause?: () => void;
};
export type SelectOutput = { write: (s: string) => void };
export type SelectOpts = { initial?: number; canBack?: boolean; current?: number; input?: SelectInput; output?: SelectOutput };

const UP = ["up", "k"];
const DOWN = ["down", "j"];
const SELECT = ["return", "enter", "space"];

/**
 * Pure: the rendered menu frame with `active` highlighted (❯). Each line is
 * clipped to `width` so it NEVER wraps — wrapping would desync the in-place
 * redraw (which moves the cursor up by logical-line count).
 */
export function renderMenu(
  title: string,
  options: string[],
  active: number,
  opts: { canBack?: boolean; width?: number; current?: number } = {},
): string {
  const width = Math.max(20, opts.width ?? 80);
  const clip = (s: string) => ([...s].length > width ? [...s].slice(0, width - 1).join("") + "…" : s);
  // ` → (●) label  ← currently active` for the cursor, `   (○) label` otherwise.
  const rows = options.map((o, i) => {
    const cursor = i === active;
    const annot = i === opts.current ? "  ← currently active" : "";
    const line = clip(`${cursor ? " → " : "   "}(${cursor ? "●" : "○"}) ${o}${annot}`);
    return cursor ? `\x1b[1;32m${line}\x1b[0m` : line;
  });
  const hint = `\x1b[2m  ↑↓ navigate  ENTER/SPACE select  ESC ${opts.canBack ? "back" : "cancel"}\x1b[0m`;
  return [`\x1b[1m  ${clip(title)}\x1b[0m`, hint, "", ...rows].join("\n");
}

/**
 * Show an arrow-key menu. Resolves the chosen index, or -1 for Esc/back (only
 * when `canBack`). Non-TTY input → resolves `initial` immediately (headless-safe).
 */
export function select(title: string, options: string[], opts: SelectOpts = {}): Promise<number> {
  const input = opts.input ?? (process.stdin as unknown as SelectInput);
  const output = opts.output ?? process.stdout;
  const canBack = opts.canBack ?? false;
  let active = opts.initial ?? 0;
  if (!input.isTTY) return Promise.resolve(active);

  return new Promise((resolve) => {
    try { emitKeypressEvents(input as unknown as NodeJS.ReadStream); } catch { /* fake stream in tests */ }
    input.setRawMode?.(true);
    input.resume?.();
    const width = process.stdout.columns ?? 80;
    let prev = 0;
    const draw = () => {
      if (prev) output.write(`\x1b[${prev}A\x1b[0J`); // cursor up + clear to end
      const frame = renderMenu(title, options, active, { canBack, width, current: opts.current });
      output.write(frame + "\n");
      prev = frame.split("\n").length;
    };
    const finish = (val: number) => {
      if (prev) output.write(`\x1b[${prev}A\x1b[0J`); // erase the menu — clean transcript (curses-style)
      input.off("keypress", onKey);
      input.setRawMode?.(false);
      input.pause?.();
      resolve(val);
    };
    const move = (d: number) => { active = (active + d + options.length) % options.length; draw(); };
    const onKey = (_s: string, key: Key) => {
      const n = key.name ?? "";
      if (key.ctrl && n === "c") { input.setRawMode?.(false); output.write("\n"); process.exit(130); }
      else if (UP.includes(n)) move(-1);
      else if (DOWN.includes(n)) move(1);
      else if (SELECT.includes(n)) finish(active);
      else if (n === "escape") finish(-1); // ESC = cancel/back (caller maps -1)
    };
    input.on("keypress", onKey);
    draw();
  });
}
