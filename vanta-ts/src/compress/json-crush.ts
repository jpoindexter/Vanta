import type { CompressOptions } from "./types.js";
import { DEFAULTS } from "./types.js";

// SmartCrusher, native: the high-value win. Fat tool outputs are usually arrays
// of similar objects (search results, file lists, API rows). Keep a head + tail
// sample, elide the middle with a count, and truncate runaway string values.
// Pure, recursive, depth-bounded. Lossy by design — the original is in CCR.

const MAX_DEPTH = 6;

type Json = unknown;

/** Truncate a long string with a char-count marker. Pure. */
function crushString(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(+${s.length - max} chars)`;
}

/** True for an array whose elements are all plain objects (the crushable shape). */
function isObjectArray(v: Json): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((e) => e !== null && typeof e === "object" && !Array.isArray(e))
  );
}

function crushValue(v: Json, opts: Required<CompressOptions>, depth: number): Json {
  if (typeof v === "string") return crushString(v, opts.maxStringLength);
  if (depth >= MAX_DEPTH) return v;

  if (isObjectArray(v)) return crushObjectArray(v, opts, depth);

  if (Array.isArray(v)) {
    return v.map((e) => crushValue(e, opts, depth + 1));
  }
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = crushValue(val, opts, depth + 1);
    return out;
  }
  return v;
}

/** Keep head+tail items; replace the middle with an elision marker object. */
function crushObjectArray(
  arr: Record<string, unknown>[],
  opts: Required<CompressOptions>,
  depth: number,
): Json[] {
  const keep = opts.headItems + opts.tailItems;
  if (arr.length <= keep + 1) {
    return arr.map((e) => crushValue(e, opts, depth + 1));
  }
  const head = arr.slice(0, opts.headItems).map((e) => crushValue(e, opts, depth + 1));
  const tail = arr.slice(arr.length - opts.tailItems).map((e) => crushValue(e, opts, depth + 1));
  const elided = arr.length - opts.headItems - opts.tailItems;
  const sampleKeys = Object.keys(arr[0] ?? {});
  return [...head, { __elided__: elided, sample_keys: sampleKeys }, ...tail];
}

/**
 * Compress a JSON string. Returns the re-serialized crushed JSON, or the
 * original string unchanged if it doesn't parse. Pure.
 */
export function crushJson(raw: string, options: CompressOptions = {}): string {
  const opts = { ...DEFAULTS, ...options };
  let parsed: Json;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw; // not valid JSON — let the router fall back to log/text
  }
  const crushed = crushValue(parsed, opts, 0);
  return JSON.stringify(crushed, null, 2);
}
