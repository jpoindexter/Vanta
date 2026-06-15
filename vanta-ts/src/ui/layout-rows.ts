import { WORDMARK } from "./wordmark.js";
import type { Entry, ToolEntry } from "./types.js";

// Estimate the physical row count that committed (<Static>) content occupies, so
// app.tsx can size the bottom-pin spacer (pinned-region.tsx). Mirrors
// transcript.tsx's EntryView / banner.tsx layout closely enough — precision only
// matters while content is SHORT, because once committed rows reach the viewport
// the spacer is 0 and the composer flows naturally at the bottom regardless. So
// wrapping/markdown approximations are fine.

const THINK_MAX = 3;
const DIFF_MAX = 12;

/** Physical rows the splash banner commits: wordmark + margins + 3 meta lines. */
export const BANNER_ROWS = WORDMARK.length + 1 /*marginTop*/ + 3 /*tagline+model+cwd*/ + 1 /*marginBottom*/;

/** Rows a string occupies at `cols`, accounting for hard newlines + soft wrap. */
function textRows(text: string, cols: number): number {
  const lines = text.split("\n");
  if (cols <= 0) return lines.length;
  return lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / cols)), 0);
}

/** Rows one completed tool row occupies: head + optional ⎿ meta + optional diff. */
function toolRows(tool: ToolEntry): number {
  const hasMeta = (tool.ok !== false ? tool.summary : tool.errorLine) ? 1 : 0;
  const diffLen = tool.diff?.length ?? 0;
  const diff = diffLen > 0 ? Math.min(DIFF_MAX, diffLen) + (diffLen > DIFF_MAX ? 1 : 0) : 0;
  return 1 + hasMeta + diff;
}

/** Estimated physical rows for one committed entry, including its leading margin. */
export function estimateEntryRows(entry: Entry, cols: number): number {
  switch (entry.kind) {
    case "user":
    case "assistant":
    case "note":
      return 1 /*marginTop*/ + textRows(entry.text, cols);
    case "thinking":
      return 2 /*marginTop + header*/ + Math.min(THINK_MAX, entry.text.split("\n").filter((l) => l.trim()).length);
    case "tool":
      return toolRows(entry);
    case "toolGroup":
      return 1 /*marginTop*/ + entry.tools.reduce((n, tl) => n + toolRows(tl), 0);
  }
}

/** Total committed rows = banner + every entry. Sizes the bottom-pin spacer. */
export function estimateCommittedRows(entries: Entry[], cols: number): number {
  return BANNER_ROWS + entries.reduce((n, e) => n + estimateEntryRows(e, cols), 0);
}
