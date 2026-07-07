import { computeDiff, type DiffLine } from "./diff.js";

// VANTA-STRUCTURED-DIFF — the pure data model + terminal render behind the
// color-diff view, hunk detail (expand/collapse), and multi-file navigator.
// computeDiff already yields a context-collapsed DiffLine[] (`···` separators);
// this adds: hunk grouping (each collapsible change block + its ± counts), a
// per-file stat summary (the DiffFileList rows), and a marker/colorless render.
// No React — the Ink components consume these; pure + fully unit-testable.

export type DiffMark = "+" | "-" | " " | "…";

/** The gutter mark + text for one diff line (color is applied by the renderer). Pure. */
export function lineMark(line: DiffLine): { mark: DiffMark; text: string } {
  if (line.type === "add") return { mark: "+", text: line.text };
  if (line.type === "remove") return { mark: "-", text: line.text };
  if (line.text === "···") return { mark: "…", text: "" };
  return { mark: " ", text: line.text };
}

export type DiffHunk = { lines: DiffLine[]; adds: number; removes: number };

/**
 * Group a context-collapsed DiffLine[] into hunks split on the `···` markers —
 * each hunk is one expand/collapse unit with its own ± counts. Context-only
 * segments (no change) are dropped. Pure.
 */
export function groupHunks(lines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let cur: DiffLine[] = [];
  const flush = (): void => {
    if (cur.some((l) => l.type !== "context")) {
      hunks.push({
        lines: cur,
        adds: cur.filter((l) => l.type === "add").length,
        removes: cur.filter((l) => l.type === "remove").length,
      });
    }
    cur = [];
  };
  for (const l of lines) {
    if (l.type === "context" && l.text === "···") flush();
    else cur.push(l);
  }
  flush();
  return hunks;
}

export type DiffStat = { adds: number; removes: number };

/** ± line counts for a diff. Pure. */
export function diffStat(lines: DiffLine[]): DiffStat {
  return {
    adds: lines.filter((l) => l.type === "add").length,
    removes: lines.filter((l) => l.type === "remove").length,
  };
}

export type DiffFile = { path: string; before: string; after: string };
export type DiffFileSummary = { path: string; adds: number; removes: number; hunks: number; lines: DiffLine[] };

/**
 * The multi-file navigator model: per file, its diff + ± counts + hunk count.
 * Unchanged files (no diff lines) are omitted so the list shows only what moved.
 * Pure — computeDiff does the LCS work.
 */
export function summarizeFiles(files: readonly DiffFile[]): DiffFileSummary[] {
  const out: DiffFileSummary[] = [];
  for (const f of files) {
    const lines = computeDiff(f.before, f.after);
    if (!lines.length) continue;
    const stat = diffStat(lines);
    out.push({ path: f.path, adds: stat.adds, removes: stat.removes, hunks: groupHunks(lines).length, lines });
  }
  return out;
}

/** One `+adds -removes` row per changed file, for the navigator list. Pure. */
export function formatFileList(files: readonly DiffFileSummary[]): string {
  if (!files.length) return "(no changes)";
  return files.map((f) => `  ${f.path}  +${f.adds} -${f.removes} (${f.hunks} hunk${f.hunks === 1 ? "" : "s"})`).join("\n");
}

/** Colorless unified render of a diff (gutter marks), for logs/non-React callers. Pure. */
export function renderDiffText(lines: DiffLine[]): string {
  return lines
    .map((l) => {
      const { mark, text } = lineMark(l);
      return mark === "…" ? "  ⋯" : `${mark} ${text}`;
    })
    .join("\n");
}
