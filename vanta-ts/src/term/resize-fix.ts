import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Ink 7's resize handler (`Ink.resized` in ink/build/ink.js) clears the screen
// only when the width DECREASES, and even then via log-update's RELATIVE erase
// — `eraseLines(previousLineCount)`, a LOGICAL line count. When a terminal
// changes width it physically REWRAPS already-displayed lines, so that count is
// wrong in BOTH directions: a full-width element (the composer's rounded border)
// survives as a stacked ghost on every resize. Ink already has a correct
// absolute-clear path (`clearTerminal` + replay static + dynamic), but only
// takes it when a frame overflows the viewport.
//
// This shim forces that path on every resize without patching node_modules or
// going fullscreen (which would forfeit native <Static> scrollback): it reaches
// the live Ink instance through Ink's internal WeakMap (keyed by stdout) and
// appends a resize listener that triggers the absolute clear. Fully guarded — if
// Ink's internals change shape, the default behavior is left untouched.

/** The slice of Ink's private instance we drive. Shape verified against 7.0.6. */
export type InkInternals = {
  onRender: () => void;
  calculateLayout: () => void;
  lastOutputHeight: number;
};

export type ResizeScheduler = (repaint: () => void) => () => void;

const scheduleSettledRepaint: ResizeScheduler = (repaint) => {
  // Ink throttles normal frames to 30 fps. Repaint after that trailing frame and
  // after React resize subscribers have committed their dimension-dependent
  // layout; repainting synchronously from SIGWINCH can redraw the previous width.
  const timer = setTimeout(repaint, 50);
  return () => clearTimeout(timer);
};

export function isInkInternals(v: unknown): v is InkInternals {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.onRender === "function" && typeof o.calculateLayout === "function" && typeof o.lastOutputHeight === "number";
}

/**
 * Repaint via Ink's absolute-clear path. Setting `lastOutputHeight` huge makes
 * Ink's `shouldClearTerminalForFrame()` see `wasOverflowing` and emit
 * `clearTerminal + fullStaticOutput + output` — immune to terminal rewrapping.
 * Ink's own `log.sync()` inside that path re-syncs cursor state and restores
 * `lastOutputHeight` to the real value, so later in-place renders stay correct.
 */
export function forceFullRepaint(ink: InkInternals): void {
  ink.calculateLayout();
  ink.lastOutputHeight = Number.MAX_SAFE_INTEGER;
  ink.onRender();
}

/**
 * Append a resize listener that force-repaints via the absolute-clear path after
 * the resize settles. Width and height both invalidate the physical frame: width
 * changes rewrap existing rows, while height changes alter fullscreen/viewport
 * geometry. The deferred repaint runs after Ink's 30 fps trailing frame and
 * React's resize subscribers, so it cannot redraw a stale pre-resize layout.
 * Rapid resize events coalesce into one repaint at the final dimensions.
 *
 * Appended (not replacing) so Ink's own `resized()` and layout listeners still
 * run. Returns a cleanup so a restarted TUI cannot retain either the listener or
 * a scheduled repaint for an unmounted Ink instance.
 */
export function attachResizeRepaint(
  stdout: Pick<NodeJS.WriteStream, "on" | "off" | "columns" | "rows">,
  ink: InkInternals,
  schedule: ResizeScheduler = scheduleSettledRepaint,
): () => void {
  let lastWidth = stdout.columns;
  let lastHeight = stdout.rows;
  let cancelRepaint: (() => void) | null = null;
  const listener = (): void => {
    const width = stdout.columns;
    const height = stdout.rows;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    cancelRepaint?.();
    cancelRepaint = schedule(() => {
      cancelRepaint = null;
      forceFullRepaint(ink);
    });
  };
  stdout.on("resize", listener);
  return () => {
    stdout.off("resize", listener);
    cancelRepaint?.();
    cancelRepaint = null;
  };
}

/** Resolve Ink's live instance for a stdout via its internal (non-exported) map. */
async function resolveInkInstance(stdout: NodeJS.WriteStream): Promise<InkInternals | null> {
  // Ink's `exports` map blocks the subpath, but a direct file:// import bypasses it.
  const require = createRequire(import.meta.url);
  const instancesUrl = `file://${join(dirname(require.resolve("ink")), "instances.js")}`;
  const mod: unknown = await import(instancesUrl);
  const instances = (mod as { default?: unknown }).default;
  if (!(instances instanceof WeakMap)) return null;
  const ink: unknown = instances.get(stdout);
  return isInkInternals(ink) ? ink : null;
}

/**
 * Install the resize ghost fix on a TTY stdout after Ink has rendered into it.
 * Returns a cleanup; it is a no-op on non-TTY streams or when Ink's internals
 * are unavailable.
 */
export async function installResizeGhostFix(stdout: NodeJS.WriteStream): Promise<() => void> {
  const noop = (): void => {};
  if (!stdout.isTTY) return noop;
  try {
    const ink = await resolveInkInstance(stdout);
    return ink ? attachResizeRepaint(stdout, ink) : noop;
  } catch {
    /* Ink internals unavailable — leave Ink's default resize behavior in place. */
    return noop;
  }
}
