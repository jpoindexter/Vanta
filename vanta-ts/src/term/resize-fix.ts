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
 * Append a resize listener that force-repaints via the absolute-clear path —
 * but ONLY on a WIDTH change, which is what rewraps displayed lines and ghosts.
 * A height-only resize has no rewrap, so we leave Ink's normal relative
 * re-render in place (it keeps content naturally bottom-anchored; force-clearing
 * would jump it to the top with a gap below). Appended (not replacing) so Ink's
 * own `resized()` and use-window-size's listener still run; ours runs last and
 * overwrites any ghost with a clean absolute repaint. Returns a cleanup so a
 * restarted TUI surface cannot retain a listener for an unmounted Ink instance.
 */
export function attachResizeRepaint(
  stdout: Pick<NodeJS.WriteStream, "on" | "off" | "columns">,
  ink: InkInternals,
): () => void {
  let lastWidth = stdout.columns;
  const listener = (): void => {
    const width = stdout.columns;
    if (width === lastWidth) return; // height-only resize: no rewrap, no ghost
    lastWidth = width;
    forceFullRepaint(ink);
  };
  stdout.on("resize", listener);
  return () => stdout.off("resize", listener);
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
