// Pure glimmer/shimmer model for the busy "working" label (VANTA-SPINNER-GLIMMER).
//
// While a turn is processing, the working text can show a glimmer: a bright band
// of W character positions that sweeps left→right across the label and wraps,
// advancing one position per render tick — so the label reads as alive instead
// of a static string. The model here is pure + tick-driven so it unit-tests
// without timers, mirroring the sibling spinner models (spinner-stalled.ts,
// term/spinner-verbs.ts).
//
// Off / static (default, VANTA_GLIMMER unset) = the plain text: glimmerSegments
// returns the whole text as one normal (non-bright) segment, so the render layer
// emits the exact current output. On = the band positions are "bright" and the
// render layer wraps the bright runs in a brighter Ink color.
//
// The live render point: ui/busy.ts busyLabel() composes {frame, verb, suffix};
// ui/app-regions.tsx (LiveRegion) renders the verb. To wire the glimmer, the
// render layer would call glimmerSegments(verb, tick) and render each segment —
// bright runs in a brighter color (e.g. <Text color="whiteBright">), normal runs
// as today's <Text dimColor> — instead of printing the bare verb string. Gated
// by glimmerEnabled(process.env); off = the single-normal-segment path = plain.

/** Env var that turns the glimmer on (default off so behavior is unchanged). */
export const GLIMMER_ENV = "VANTA_GLIMMER";

/** Default bright-band width in characters. */
const DEFAULT_BAND_WIDTH = 3;

/** True only when VANTA_GLIMMER is explicitly on ("1"/"true"). Default off. */
export function glimmerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[GLIMMER_ENV];
  return raw === "1" || raw === "true";
}

/** Options for the band/segment model: an explicit band width override. */
export interface GlimmerOptions {
  /** Bright-band width in characters (clamped to 1..length). */
  bandWidth?: number;
}

/** Resolve a usable band width for a text of `length`: clamp to 1..length. */
function resolveBandWidth(length: number, bandWidth?: number): number {
  const requested = typeof bandWidth === "number" && bandWidth > 0 ? Math.trunc(bandWidth) : DEFAULT_BAND_WIDTH;
  return Math.max(1, Math.min(length, requested));
}

/**
 * The set of "bright" character indices for a text of `length` at `tick`: a band
 * of width W whose start position sweeps 0..length-1 and wraps per tick. Each
 * band index is taken modulo `length`, so the band wraps around the end of the
 * text. Empty/zero length → an empty set. Negative/fractional tick is floored
 * and wrapped into range.
 */
export function glimmerBand(length: number, tick: number, opts?: GlimmerOptions): Set<number> {
  const len = Math.max(0, Math.trunc(length));
  const bright = new Set<number>();
  if (len === 0) return bright;
  const width = resolveBandWidth(len, opts?.bandWidth);
  const step = Number.isFinite(tick) ? Math.floor(tick) : 0;
  const start = ((step % len) + len) % len;
  for (let offset = 0; offset < width; offset += 1) {
    bright.add((start + offset) % len);
  }
  return bright;
}

/** One run of the text: a maximal stretch of same-brightness characters. */
export interface GlimmerSegment {
  /** The substring for this run. */
  text: string;
  /** Whether this run is in the bright band at the current tick. */
  bright: boolean;
}

/**
 * Split `text` into ordered bright/normal runs for `tick`: adjacent characters
 * with the same brightness coalesce into one segment, so the render layer wraps
 * each bright run in a brighter color and leaves normal runs as today's text.
 * Concatenating the segment texts reconstructs `text` exactly. Empty text → [].
 */
export function glimmerSegments(text: string, tick: number, opts?: GlimmerOptions): GlimmerSegment[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const bright = glimmerBand(chars.length, tick, opts);
  const segments: GlimmerSegment[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const isBright = bright.has(i);
    const last = segments[segments.length - 1];
    if (last && last.bright === isBright) {
      last.text += chars[i]!;
    } else {
      segments.push({ text: chars[i]!, bright: isBright });
    }
  }
  return segments;
}

/**
 * The static (off / non-glimmer) render path: the whole text as one normal
 * segment — byte-identical to the current plain output. The render layer calls
 * this when glimmerEnabled is false.
 */
export function plainSegments(text: string): GlimmerSegment[] {
  return text.length === 0 ? [] : [{ text, bright: false }];
}
