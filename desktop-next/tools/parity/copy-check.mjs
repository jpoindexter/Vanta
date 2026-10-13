// Copy inventory comparison: every visible wireframe string must appear in the app, per state.
import { stripGlyphs } from "./compare.mjs";

function tally(strings) {
  const m = new Map();
  for (const s of strings) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

/** Strings (multiset) in `want` that `have` lacks, matching exactly first, then glyph-insensitively. */
function missing(want, have, allowGlyphs) {
  const rest = tally(have);
  const strippedRest = new Map();
  for (const [s, n] of rest) strippedRest.set(stripGlyphs(s), (strippedRest.get(stripGlyphs(s)) ?? 0) + n);
  const lost = [];
  let glyphOnly = 0;
  for (const s of want) {
    if (rest.get(s) > 0) rest.set(s, rest.get(s) - 1);
    else if (allowGlyphs && stripGlyphs(s) === "") glyphOnly += 1;
    else if (allowGlyphs && strippedRest.get(stripGlyphs(s)) > 0) {
      strippedRest.set(stripGlyphs(s), strippedRest.get(stripGlyphs(s)) - 1);
      glyphOnly += 1;
    } else lost.push(s);
  }
  return { lost, glyphOnly };
}

/**
 * One row per state. FAIL lists missing strings; ALLOWED means the only differences were
 * icon glyphs and `allowGlyphs` is set (a declared stripGlyphs deviation); UNMAPPED when the state was not drivable.
 */
export function copyRow({ stateId, expected, appStrings, blocked, allowGlyphs }) {
  const want = [...expected.strings, ...expected.hoverOnly];
  const total = want.length;
  if (blocked) return { state: stateId, status: "UNMAPPED", reason: blocked, total, found: 0 };
  const { lost, glyphOnly } = missing(want, appStrings, allowGlyphs);
  const found = total - lost.length;
  const extra = missing(appStrings, want, allowGlyphs).lost.length;
  const status = lost.length ? "FAIL" : glyphOnly ? "ALLOWED" : "PASS";
  return { state: stateId, status, total, found, glyphOnly, extra, ...(lost.length && { missing: lost }) };
}
