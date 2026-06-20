import { readVelocityEvents, type VelocityEvent } from "./store.js";

/** Capture:ship counts + ratio over a list of velocity events. Pure. */
export type CaptureShipRatio = {
  captures: number;
  ships: number;
  /** captures / max(1, ships) — never divides by zero. */
  ratio: number;
};

/** Defaults for the closure warning gate. */
export const VELOCITY_CLOSURE_THRESHOLD = 5;
const DEFAULT_TOP_N = 3;

type ClosureOpts = { threshold?: number; n?: number };

/**
 * Capture:ship ratio across all events. ratio = captures / max(1, ships) so a
 * zero-ship history reports the raw capture count rather than dividing by zero.
 */
export function captureShipRatio(events: VelocityEvent[]): CaptureShipRatio {
  const captures = events.filter((e) => e.type === "capture").length;
  const ships = events.filter((e) => e.type === "ship").length;
  return { captures, ships, ratio: captures / Math.max(1, ships) };
}

/**
 * The most-recent captured-but-not-shipped item ids — a capture whose itemId has
 * no later ship event. Newest first, capped to n. Pure.
 */
export function topUnfinished(events: VelocityEvent[], n = DEFAULT_TOP_N): string[] {
  const shippedAfter = lastShipTimes(events);
  const seen = new Set<string>();
  const unfinished: string[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.type !== "capture" || seen.has(e.itemId)) continue;
    seen.add(e.itemId);
    const ship = shippedAfter.get(e.itemId);
    if (ship === undefined || time(e.at) > ship) unfinished.push(e.itemId);
  }
  return unfinished.slice(0, n);
}

/** Latest ship timestamp (ms) per itemId across all events. */
function lastShipTimes(events: VelocityEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "ship") continue;
    const t = time(e.at);
    if (t > (out.get(e.itemId) ?? -Infinity)) out.set(e.itemId, t);
  }
  return out;
}

function time(at: string): number {
  const t = new Date(at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * A formatted warning when the capture:ship ratio exceeds `threshold` — the ratio
 * plus the top-N unfinished item ids. Empty string at or under threshold. Pure.
 */
export function velocityClosureWarning(events: VelocityEvent[], opts: ClosureOpts = {}): string {
  const threshold = opts.threshold ?? VELOCITY_CLOSURE_THRESHOLD;
  const { captures, ships, ratio } = captureShipRatio(events);
  if (ratio <= threshold) return "";
  const unfinished = topUnfinished(events, opts.n ?? DEFAULT_TOP_N);
  const head = `  ⚠ capture:ship ${ratio.toFixed(1)}:1 (${captures} captured, ${ships} shipped) — finish before starting`;
  if (!unfinished.length) return head;
  const list = unfinished.map((id) => `    · ${id}`).join("\n");
  return `${head}\n  top unfinished:\n${list}`;
}

/**
 * Best-effort reader: loads velocity events via the existing store and returns the
 * closure warning (or "" when under threshold / on any read failure). Never throws.
 */
export async function readVelocityClosure(
  env: NodeJS.ProcessEnv,
  opts: ClosureOpts = {},
): Promise<string> {
  try {
    return velocityClosureWarning(await readVelocityEvents(env), opts);
  } catch {
    return "";
  }
}
