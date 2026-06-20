// Pragmatic bidirectional-text reorder for terminal output. The renderer (and the
// terminal grid) lay glyphs left-to-right, so a logical-order string containing a
// strong-RTL run (Hebrew/Arabic) shows that run BACKWARDS. This module turns
// logical order into the correct VISUAL order: RTL runs are reversed in place, and
// the order of runs on the line is mirrored when the line's base direction is RTL.
//
// SCOPE — this is NOT the full Unicode Bidi Algorithm (UBA). It detects strong-RTL
// chars by Unicode block, splits each line into directional runs, reverses RTL runs,
// keeps digits + Latin LTR, and mirrors run order under an RTL base. It deliberately
// skips: bidi control chars, neutral/weak resolution rules (L1–L4), bracket pairing,
// mirrored-glyph substitution, and nested embeddings. It covers the common cases —
// a pure-RTL line, a mixed RTL+LTR line, and RTL with embedded digits/Latin — well.

/** Strong-RTL ranges: Hebrew (U+0590–05FF), Arabic (U+0600–06FF), and the Arabic
 *  Supplement (U+0750–077F). One source of truth for detection and run splitting. */
const RTL_RE = /[֐-׿؀-ۿݐ-ݿ]/;
const RTL_RE_G = /[֐-׿؀-ۿݐ-ݿ]/g;

/** True when `text` contains any strong-RTL character — the render guard. Pure. */
export function hasRtl(text: string): boolean {
  return RTL_RE.test(text);
}

type RunDir = "rtl" | "ltr";
/** `neutral` = inter-run whitespace, kept as its own run so it ends up on the
 *  correct side when the run order is mirrored under an RTL base (it would
 *  otherwise glue to the LTR run and land on the wrong edge). */
type RunKind = RunDir | "neutral";
type Run = { dir: RunKind; text: string };

/** Classify one code point: strong-RTL (`rtl`), inter-run whitespace (`neutral`),
 *  or everything else (`ltr` — digits, Latin, punctuation). Splitting whitespace
 *  out is the pragmatic stand-in for UBA neutral resolution. */
function charDir(ch: string): RunKind {
  if (RTL_RE.test(ch)) return "rtl";
  if (/\s/.test(ch)) return "neutral";
  return "ltr";
}

/** Split a line into maximal same-kind runs in LOGICAL order. Pure. */
function splitRuns(line: string): Run[] {
  const runs: Run[] = [];
  for (const ch of line) {
    const dir = charDir(ch);
    const last = runs[runs.length - 1];
    if (last && last.dir === dir) last.text += ch;
    else runs.push({ dir, text: ch });
  }
  return runs;
}

/** Reverse the code points of a string (so an RTL run reads correctly L→R on the
 *  grid). Uses the iterator so astral/multi-unit code points stay intact. Pure. */
function reverseChars(s: string): string {
  return [...s].reverse().join("");
}

/** Resolve a line's base direction: explicit override wins; else the first strong
 *  character decides (UBA P2/P3, simplified — no paragraph-level isolate handling). */
function baseDir(line: string, override?: RunDir): RunDir {
  if (override) return override;
  const m = line.match(RTL_RE_G);
  // First strong char: scan for the earliest RTL vs the earliest Latin letter.
  const firstRtl = m ? line.search(RTL_RE) : -1;
  const firstLtr = line.search(/[A-Za-z]/);
  if (firstRtl === -1) return "ltr";
  if (firstLtr === -1) return "rtl";
  return firstRtl < firstLtr ? "rtl" : "ltr";
}

/** Reorder one already-split line of runs into visual order for the given base.
 *  RTL runs are reversed in place; under an RTL base the whole run sequence is
 *  mirrored (and each LTR run keeps its internal order). Pure. */
function visualLine(runs: Run[], base: RunDir): string {
  const placed = runs.map((r) => (r.dir === "rtl" ? reverseChars(r.text) : r.text));
  if (base === "rtl") placed.reverse();
  return placed.join("");
}

// `baseDir` only resolves "rtl" | "ltr" — neutral whitespace runs never set the
// base; the first strong (rtl) vs first Latin letter does.

/**
 * Reorder logical-order text into terminal-visual order, line by line. Lines with
 * no strong-RTL character are returned byte-identical (so pure-LTR output is
 * untouched). `baseDir` overrides the per-line first-strong-char heuristic when the
 * caller knows the paragraph direction. Pure: string in, string out, no I/O.
 */
export function reorderBidi(text: string, baseDir?: RunDir): string {
  if (!hasRtl(text)) return text;
  return text
    .split("\n")
    .map((line) => (hasRtl(line) ? visualLine(splitRuns(line), baseDirOf(line, baseDir)) : line))
    .join("\n");
}

/** Per-line base direction, honoring an explicit override. Split out so the cx of
 *  `reorderBidi` stays low. */
function baseDirOf(line: string, override?: RunDir): RunDir {
  return baseDir(line, override);
}
