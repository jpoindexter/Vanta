import { SPINNER_VERBS } from "./figures.js";

// User-configurable loading-message verbs (VANTA-SPINNER-VERBS).
//
// The built-in rotating "working" verbs live in figures.ts (SPINNER_VERBS) -
// that stays the single source of truth for the default. This module is the
// PURE resolution layer: parse a user-supplied list out of the environment,
// merge/override the default with it, and pick the active verb for a tick.
//
// Unset / blank env => the current built-in verbs (no behaviour change).
// The live busy component (ui/busy.ts busyLabel -> ui/app-regions.tsx LiveRegion)
// would call resolveSpinnerVerbs(process.env) once, then spinnerVerbAt(verbs, tick)
// per frame instead of indexing SPINNER_VERBS directly.

/** The built-in verb list - mirrors figures.ts so callers have one import. */
export const DEFAULT_SPINNER_VERBS: readonly string[] = SPINNER_VERBS;

/** Env var holding the user's verb override (comma- or pipe-separated). */
export const SPINNER_VERBS_ENV = "VANTA_SPINNER_VERBS";

// Split on comma OR pipe so either separator works ("a,b" or "a|b").
const SEPARATORS = /[,|]/;

// Strip C0 (incl. ESC 0x1B), DEL, and C1 control chars so a verb can't inject
// a terminal escape sequence. Written with \u escapes (not raw bytes) for safety.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

function stripControl(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

/**
 * Parse a raw env value into a clean verb list: split on comma/pipe, trim each,
 * control-strip each (security: no embedded escape sequences), drop empties.
 * A non-string or empty result yields an empty array (caller falls back).
 */
export function parseUserVerbs(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(SEPARATORS)
    .map((part) => stripControl(part).trim())
    .filter((part) => part.length > 0);
}

/**
 * Resolve the active verb list from the environment: the user's verbs when they
 * provided a non-empty list, otherwise the built-in default. Returns a fresh
 * array (never the shared default reference) so callers can't mutate the source.
 */
export function resolveSpinnerVerbs(env: NodeJS.ProcessEnv = process.env): string[] {
  const user = parseUserVerbs(env[SPINNER_VERBS_ENV]);
  return user.length > 0 ? user : [...DEFAULT_SPINNER_VERBS];
}

/**
 * Pick the verb for a tick: cycle through `verbs`, wrapping. Falls back to the
 * default list if given an empty list, so the spinner never shows a blank verb.
 * A negative or fractional tick is floored and wrapped into range.
 */
export function spinnerVerbAt(verbs: readonly string[], tick: number): string {
  const list = verbs.length > 0 ? verbs : DEFAULT_SPINNER_VERBS;
  const step = Number.isFinite(tick) ? Math.floor(tick) : 0;
  const index = ((step % list.length) + list.length) % list.length;
  return list[index]!;
}
