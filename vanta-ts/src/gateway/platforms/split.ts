// MSG-SPLIT-LENGTH-AWARE — length-unit-aware message splitting.
// Messaging adapters have per-platform reply budgets measured in different units:
// Telegram counts UTF-16 code units (4096), IRC counts UTF-8 bytes (~430 per
// PRIVMSG), everything else counts characters. A reply over the budget must be
// SENT AS MULTIPLE MESSAGES, not truncated or rejected. `splitForLimit` breaks on
// newline boundaries under the budget and only hard-splits mid-line when a single
// line is itself too long. It NEVER returns a segment over the limit. Pure.

/** Which unit a platform measures its message budget in. */
export type LenUnit = "chars" | "utf16" | "bytes";

const UTF8_ENCODER = new TextEncoder();

/** UTF-16 code-unit length (what Telegram counts). Emoji outside the BMP = 2. */
export function utf16Len(text: string): number {
  return text.length;
}

/** UTF-8 byte length (what IRC counts). A multibyte char counts as its bytes. */
export function byteLen(text: string): number {
  return UTF8_ENCODER.encode(text).length;
}

/** Measure `text` in the requested unit. Pure. */
export function measure(text: string, unit: LenUnit): number {
  if (unit === "bytes") return byteLen(text);
  // "chars" and "utf16" both map to String.length: JS strings are UTF-16, so
  // .length already counts code units (an astral char counts as 2). A true
  // code-POINT count would differ, but no platform here budgets by code points.
  return text.length;
}

/**
 * Hard-split one over-budget piece into segments each within `limit` in `unit`.
 * Walks code points (via the string iterator) so a multibyte char is never cut
 * mid-sequence — a single char wider than the limit goes alone (degenerate, but
 * never over-limit by our own splitting). Pure.
 */
function hardSplit(piece: string, limit: number, unit: LenUnit): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of piece) {
    if (current && measure(current + ch, unit) > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Running split state: completed `segments` + the in-progress `current` one. */
type SplitAcc = { segments: string[]; current: string };

/** Fold one source line into the accumulator under `{limit, unit}`. Pure. */
function foldLine(acc: SplitAcc, line: string, opts: { limit: number; unit: LenUnit }): SplitAcc {
  const { limit, unit } = opts;
  const flushed = acc.current ? [...acc.segments, acc.current] : acc.segments;
  if (measure(line, unit) > limit) {
    const pieces = hardSplit(line, limit, unit);
    return { segments: [...flushed, ...pieces.slice(0, -1)], current: pieces[pieces.length - 1] ?? "" };
  }
  const candidate = acc.current ? `${acc.current}\n${line}` : line;
  if (measure(candidate, unit) <= limit) return { segments: acc.segments, current: candidate };
  return { segments: flushed, current: line };
}

/**
 * Split `text` into messages each within `limit` measured in `unit`, breaking on
 * `\n` boundaries. Lines are packed greedily; a line that alone exceeds the limit
 * is hard-split (mid-line) into limit-sized pieces. Returns `[text]` unchanged
 * when it already fits (and `[""]` for empty input — callers send nothing extra).
 * No returned segment is ever over the limit. Pure.
 */
export function splitForLimit(text: string, limit: number, unit: LenUnit): string[] {
  if (limit <= 0) return [text];
  if (measure(text, unit) <= limit) return [text];

  let acc: SplitAcc = { segments: [], current: "" };
  for (const line of text.split("\n")) acc = foldLine(acc, line, { limit, unit });
  const segments = acc.current ? [...acc.segments, acc.current] : acc.segments;
  return segments.length > 0 ? segments : [text];
}
