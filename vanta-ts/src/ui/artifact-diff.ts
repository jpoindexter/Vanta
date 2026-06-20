import { computeDiff, type DiffLine } from "../util/diff.js";

// Pure artifact diff: old text vs proposed new text → classified lines for the
// review view. Reuses the LCS-based unified diff (`util/diff.ts computeDiff`)
// and reshapes its `DiffLine[]` into a single typed line stream plus added/
// removed counts, so the review component and the tool report share one source
// of truth and never re-implement diffing.

export type ArtifactLine =
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "context"; text: string };

export type ArtifactDiff = {
  /** All lines in unified order (added/removed/context), windowed around changes. */
  lines: ArtifactLine[];
  added: number;
  removed: number;
  /** True for a brand-new artifact (no prior file content). */
  isNew: boolean;
  /** True when old and new are byte-identical (nothing to review). */
  unchanged: boolean;
};

function toArtifactLine(d: DiffLine): ArtifactLine {
  if (d.type === "add") return { kind: "added", text: d.text };
  if (d.type === "remove") return { kind: "removed", text: d.text };
  return { kind: "context", text: d.text };
}

/**
 * Diff `oldContent` (existing file, "" if absent) against `newContent` (proposed
 * artifact). Pure — no IO. For an unchanged artifact, returns `unchanged: true`
 * with no lines. For a brand-new artifact, every line is `added`.
 */
export function diffArtifact(oldContent: string, newContent: string): ArtifactDiff {
  const isNew = oldContent === "";
  if (oldContent === newContent) {
    return { lines: [], added: 0, removed: 0, isNew, unchanged: true };
  }
  const lines = computeDiff(oldContent, newContent).map(toArtifactLine);
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "added") added += 1;
    else if (l.kind === "removed") removed += 1;
  }
  return { lines, added, removed, isNew, unchanged: false };
}
