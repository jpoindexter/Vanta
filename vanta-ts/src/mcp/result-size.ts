// VANTA-MCP-RESULT-SIZE — an MCP tool result can opt into a larger output-size
// limit via a `_meta` annotation, so a server that legitimately returns big
// results isn't truncated at the default. Pure parse + bound; the requested
// size is operator-context only and CANNOT force unbounded memory — every
// resolved limit is clamped to HARD_CAP. No annotation → the default limit
// (current behavior). Mirrors tools/bash-output-limit.ts's head+tail+marker.
//
// WIRING (not done this round — named for the follow-up, mirrors clarity-gate /
// rich-output): today `mcp/mount.ts mcpToolToVantaTool(...).execute` calls
// `client.callTool(...)`, which returns `textFromContent(rawResult)` (the plain
// "\n" join) and the MCP result rendering in `mcp/rich-output.ts` bounds large
// output to the fixed `DEFAULT_PREVIEW_CHARS`. To honor a result's opt-in:
//   - Surface the RAW result (not just the joined string) from `callTool` (or a
//     sibling) so its `_meta` is reachable — `result._meta`.
//   - Compute the effective max once via `resolveResultLimit(rawResult)`, then
//     bound the joined output with `applyResultSizeLimit(joined, max)` instead
//     of the fixed default in `rich-output.ts` / `mount.ts`.
// A result with no `_meta` annotation resolves to DEFAULT_MCP_RESULT_MAX, so the
// common case is unchanged.

/** Default output-size limit (chars) when a result carries no `_meta` size hint. */
export const DEFAULT_MCP_RESULT_MAX = 20_000;
/** Hard ceiling — a result's `_meta` hint can raise the limit only this far. */
export const HARD_CAP = 500_000;

/** Fraction of the budget kept as head (the rest, minus the marker, is tail). */
const HEAD_FRACTION = 0.6;

/** The two `_meta` keys a result may use to request a larger size limit. */
const META_KEYS = ["maxResultSizeChars", "vanta/maxResultSizeChars"] as const;

/** Read a positive integer from an unknown `_meta` value, else undefined. A
 *  number must be finite/integer/positive; a numeric string is accepted (trimmed).
 *  Anything else (object, NaN, fraction, ≤0, garbage string) → undefined. */
function asPositiveInt(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
  }
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

/** Pull the first valid size hint from a result's `_meta`, reading both the
 *  bare `maxResultSizeChars` and the namespaced `vanta/maxResultSizeChars` key. */
function readMetaHint(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const record = meta as Record<string, unknown>;
  for (const key of META_KEYS) {
    const hint = asPositiveInt(record[key]);
    if (hint !== undefined) return hint;
  }
  return undefined;
}

/**
 * Resolve the requested output-size limit from a result's `_meta` annotation.
 * A valid hint is clamped to `[DEFAULT_MCP_RESULT_MAX, HARD_CAP]` — a request
 * below the default floors to the default, above the cap clamps to the cap.
 * Absent/invalid → {@link DEFAULT_MCP_RESULT_MAX}. Pure; never throws.
 */
export function parseMaxResultSize(meta: unknown): number {
  const hint = readMetaHint(meta);
  if (hint === undefined) return DEFAULT_MCP_RESULT_MAX;
  return Math.min(Math.max(hint, DEFAULT_MCP_RESULT_MAX), HARD_CAP);
}

/** The effective output-size limit for a whole MCP result, read from its
 *  `_meta`. Pure; a non-object result (or one without `_meta`) → the default. */
export function resolveResultLimit(result: unknown): number {
  if (!result || typeof result !== "object") return DEFAULT_MCP_RESULT_MAX;
  return parseMaxResultSize((result as { _meta?: unknown })._meta);
}

/** Build the "[… N chars truncated …]" middle marker for a given drop count. */
function marker(dropped: number): string {
  return `\n[… ${dropped} chars truncated …]\n`;
}

/**
 * Bound `output` to at most `maxChars`, keeping a larger head and a smaller tail
 * with a clear middle marker naming how many chars were dropped. Output already
 * within `maxChars` is returned byte-identical. The result never exceeds
 * `maxChars` (the marker budget is taken out of head+tail, not added on top).
 * Mirrors tools/bash-output-limit.ts `limitOutput`. Pure.
 */
export function applyResultSizeLimit(output: string, maxChars: number): string {
  if (maxChars <= 0 || output.length <= maxChars) return output;
  const sample = marker(output.length);
  // Budget too small to fit a marked head+tail → hard-cut the head to fit.
  if (maxChars <= sample.length) return output.slice(0, maxChars);
  const budget = maxChars - sample.length;
  const headLen = Math.max(1, Math.floor(budget * HEAD_FRACTION));
  const tailLen = budget - headLen;
  const head = output.slice(0, headLen);
  const tail = tailLen > 0 ? output.slice(output.length - tailLen) : "";
  const dropped = output.length - head.length - tail.length;
  return head + marker(dropped) + tail;
}
