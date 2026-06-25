// Pure word-wrap that PRESERVES whitespace verbatim (no collapse, no dropped runs) and
// hard-breaks a token longer than the width. Used by the streaming preview and the
// user-message highlight, which both need physical lines without mangling indentation.

/** Wrap one logical line (no newlines) to width `w`, keeping every space run intact. */
function wrapOne(line: string, w: number): string[] {
  if (line.length <= w) return [line];
  const out: string[] = [];
  let cur = "";
  for (const tok of line.match(/\s+|\S+/g) ?? []) {
    if ((cur + tok).length <= w) { cur += tok; continue; }
    if (cur) { out.push(cur); cur = ""; }
    let rest = tok;
    while (rest.length > w) { out.push(rest.slice(0, w)); rest = rest.slice(w); }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Wrap `text` to width `w` into physical lines, honoring existing newlines. Pure. */
export function wrapText(text: string, w: number): string[] {
  const width = Math.max(1, w);
  return text.split("\n").flatMap((line) => wrapOne(line, width));
}
