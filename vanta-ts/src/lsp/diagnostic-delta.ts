// Diagnostic baseline — after an edit, surface only the diagnostics the edit
// INTRODUCED. Pre-existing issues are baseline noise; the agent should not be
// blamed for them. Pure: diff two diagnostic lists + format the delta.
//
// Matching is on (message, category) ONLY — line is display-only. A diagnostic
// is "new" iff its (message, category) pair is absent from the before-set. This
// is deliberately robust to line shifts: an edit that pushes a pre-existing
// error down a few lines must NOT report it as new. Multiset counts are ignored
// (before-once + after-twice → both after-instances are baseline).

export type Diag = { line: number; message: string; category: "error" | "warning" };

/** Stable key for baseline matching. NUL-joined so message/category can't collide. */
function key(d: Diag): string {
  return `${d.category}\0${d.message}`;
}

/**
 * Diagnostics present in `after` but not in `before`, matched on
 * (message, category). Line is ignored for matching (line-shift robust).
 */
export function diffDiagnostics(before: Diag[], after: Diag[]): Diag[] {
  const baseline = new Set(before.map(key));
  return after.filter((d) => !baseline.has(key(d)));
}

const HEADER = (n: number): string =>
  `⚠ ${n} new diagnostic(s) from this edit:`;

/** Compact note for surfacing in a tool result. "" when nothing is new. */
export function formatNewDiagnostics(news: Diag[]): string {
  if (news.length === 0) return "";
  const lines = news.map((d) => `  L${d.line} ${d.category}: ${d.message}`);
  return `\n${HEADER(news.length)}\n${lines.join("\n")}`;
}
