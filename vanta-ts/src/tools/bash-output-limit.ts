/** Shell output size limiting — pure head+tail truncation with a clear middle
 *  marker, plus env-driven max resolution. Keeps a model from drowning in a
 *  multi-megabyte command dump while preserving the most useful head and tail. */

/** Default cap when no env override is set. */
export const DEFAULT_MAX_OUTPUT = 30_000;
/** Hard ceiling — no env override may exceed this. */
export const HARD_CAP_OUTPUT = 150_000;

/** Fraction of the budget reserved for the head (the rest, minus the marker, is the tail). */
const HEAD_FRACTION = 0.6;

/** Read a positive integer from an env value, else undefined (invalid → fall through). */
function parseLen(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

/**
 * Resolve the max output length from the environment. `BASH_MAX_OUTPUT_LENGTH`
 * is read first, then `VANTA_BASH_MAX_OUTPUT`; an invalid/absent/non-positive
 * value falls through to the next source, then to {@link DEFAULT_MAX_OUTPUT}.
 * Any resolved value is clamped to {@link HARD_CAP_OUTPUT}.
 */
export function resolveMaxOutput(env: NodeJS.ProcessEnv): number {
  const picked = parseLen(env.BASH_MAX_OUTPUT_LENGTH) ?? parseLen(env.VANTA_BASH_MAX_OUTPUT) ?? DEFAULT_MAX_OUTPUT;
  return Math.min(picked, HARD_CAP_OUTPUT);
}

/** Build the "[… N chars truncated …]" middle marker for a given drop count. */
function marker(dropped: number): string {
  return `\n[… ${dropped} chars truncated …]\n`;
}

/**
 * Truncate `text` to at most ~`max` characters, keeping a larger head and a
 * smaller tail with a clear middle marker naming how many chars were dropped.
 * Output already within `max` is returned byte-identical. The result never
 * exceeds `max` (the marker budget is taken out of head+tail, not added on top).
 */
export function limitOutput(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  // Reserve room for the marker; if the budget is too small for any head/tail
  // around it, just hard-cut the head to fit.
  const sample = marker(text.length);
  if (max <= sample.length) return text.slice(0, max);
  const budget = max - sample.length;
  const headLen = Math.max(1, Math.floor(budget * HEAD_FRACTION));
  const tailLen = budget - headLen;
  const head = text.slice(0, headLen);
  const tail = tailLen > 0 ? text.slice(text.length - tailLen) : "";
  const dropped = text.length - head.length - tail.length;
  return head + marker(dropped) + tail;
}
