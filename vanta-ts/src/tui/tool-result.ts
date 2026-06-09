import type { DiffLine } from "../util/diff.js";

// CC-TRANSCRIPT — pure result-summary rules for the activity feed. The render
// layer never sees a tool's raw output (that goes to the model only); instead we
// compute a short magnitude one-liner at DISPATCH time and store just that string
// on the entry. Pairs with tool-display.ts (which summarizes the CALL); this
// summarizes the RESULT. Unit-tested; transcript.tsx folds the full diff behind
// the expand toggle and shows these one-liners by default.

const SINGLE_LINE_MAX = 60;

// CC-COLLAPSED-READ: short outputs (≤ INLINE_MAX lines) always show inline;
// longer outputs fold behind ^O and show at most FOLD_PREVIEW lines when expanded.
export const INLINE_MAX = 5;
export const FOLD_PREVIEW = 12;

/**
 * Compute the display preview for a tool result: capture up to FOLD_PREVIEW
 * lines and return both the preview text and the total line count. Returns
 * undefined when output is empty. Pure — no side effects.
 */
export function buildResultPreview(output: string): { preview: string; lineCount: number } | undefined {
  const trimmed = output.trimEnd();
  if (!trimmed) return undefined;
  const lines = trimmed.split("\n");
  const lineCount = lines.length;
  const preview = lines.slice(0, FOLD_PREVIEW).join("\n");
  return { preview, lineCount };
}

/**
 * A compact magnitude for a tool result: `254 lines` for multi-line output, the
 * line itself for a short single line (e.g. `exit 0`), `N chars` for a long
 * single line, and "" for empty/whitespace output. Pure — operates on the raw
 * output string in the dispatch layer so the render layer never holds it.
 */
export function summarizeResult(output: string): string {
  const t = output.trim();
  if (!t) return "";
  const lines = t.split("\n").length;
  if (lines > 1) return `${lines} lines`;
  return t.length <= SINGLE_LINE_MAX ? t : `${t.length} chars`;
}

/** `+adds/-removes` for a diff, or "" when there's nothing changed. Pure. */
export function diffStat(diff?: DiffLine[]): string {
  if (!diff?.length) return "";
  let add = 0;
  let rem = 0;
  for (const l of diff) {
    if (l.type === "add") add++;
    else if (l.type === "remove") rem++;
  }
  return add || rem ? `+${add}/-${rem}` : "";
}
