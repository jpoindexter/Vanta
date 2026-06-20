import { ASTERISK_FRAMES, STALLED_FRAMES } from "../term/figures.js";

// Pure stalled-spinner logic (VANTA-SPINNER-STALLED). When a turn has been busy
// past a threshold with no visible progress, the busy spinner shifts to a
// distinct "stalled" presentation — a different frame set + a "(still working…
// Ns)" suffix — so a stuck/slow state is VISIBLE instead of an identical spin.
// Under the threshold = the normal spinner (current behavior).
//
// Everything here is pure + tick/elapsed-driven so it unit-tests without timers.
// The live busy component (ui/app-regions.tsx → LiveRegion) calls
// spinnerPresentation(elapsedMs, tick) per render tick (elapsedMs = tick *
// TICK_MS from use-busy-tick) and renders {glyph, suffix} instead of the bare
// busyLabel().frame.

/** Default stall threshold: ~20s of no-visible-progress before escalating. */
const DEFAULT_THRESHOLD_MS = 20_000;

/** Env override for the stall threshold (milliseconds). */
const STALL_ENV_VAR = "VANTA_STALL_SPINNER_MS";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;

/** Resolve the active threshold: a positive numeric env override, else default. */
function resolveThresholdMs(thresholdMs?: number): number {
  if (typeof thresholdMs === "number" && thresholdMs > 0) return thresholdMs;
  const raw = process.env[STALL_ENV_VAR];
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_THRESHOLD_MS;
}

/**
 * True once the turn has been busy with no visible progress past the threshold.
 * Negative/zero elapsed is never stalled (a fresh turn).
 */
export function isStalled(elapsedMs: number, thresholdMs?: number): boolean {
  if (!(elapsedMs > 0)) return false;
  return elapsedMs >= resolveThresholdMs(thresholdMs);
}

/** Compact duration for the stalled suffix: 24000 → "24s", 90000 → "1m". */
export function compactDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  if (totalSeconds < SECONDS_PER_MINUTE) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / SECONDS_PER_MINUTE)}m`;
}

/** The stalled suffix shown after the verb: "(still working… 24s)". */
export function stalledLabel(elapsedMs: number): string {
  return `(still working… ${compactDuration(elapsedMs)})`;
}

/** Options for {@link spinnerFrame}: an explicit threshold override. */
export interface SpinnerFrameOptions {
  thresholdMs?: number;
}

/**
 * The frame to show for the current tick. Under the threshold → the normal
 * growing-asterisk frame (current behavior); past it → a distinct stalled frame.
 * Both rotate by tick so the spinner keeps animating.
 */
export function spinnerFrame(elapsedMs: number, tick: number, opts?: SpinnerFrameOptions): string {
  const t = Math.max(0, Math.trunc(tick));
  if (isStalled(elapsedMs, opts?.thresholdMs)) {
    return STALLED_FRAMES[t % STALLED_FRAMES.length]!;
  }
  return ASTERISK_FRAMES[t % ASTERISK_FRAMES.length]!;
}

/** What the live spinner renders: the glyph + an optional stalled suffix. */
export interface SpinnerPresentation {
  /** The rotating frame glyph for this tick. */
  glyph: string;
  /** "(still working… Ns)" past the threshold, else empty. */
  suffix: string;
}

/**
 * Combine frame + suffix for one render tick. Under the threshold the suffix is
 * empty (normal spinner); past it the stalled glyph set + the "(still working…
 * Ns)" suffix are returned together.
 */
export function spinnerPresentation(elapsedMs: number, tick: number): SpinnerPresentation {
  const stalled = isStalled(elapsedMs);
  return {
    glyph: spinnerFrame(elapsedMs, tick),
    suffix: stalled ? stalledLabel(elapsedMs) : "",
  };
}
