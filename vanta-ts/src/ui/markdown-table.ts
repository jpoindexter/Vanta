// VANTA-MARKDOWN-TABLES — pure GFM table layout for the terminal: aligned
// columns with │ borders + a header rule, alignment directives (:---/:--:/---:)
// honored, empty cells respected, and cells wider than the column WRAPPED across
// physical lines (not truncated — no data lost). No React here; markdown.tsx's
// TableView renders the returned lines. Pure + fully unit-testable.

export type Align = "left" | "right" | "center";

/** Per-column max width before a cell wraps to the next physical line. */
export const MAX_COL_WIDTH = 40;

/** Parse the GFM separator row (`| :--- | ---: | :--: |`) into per-column aligns. Pure. */
export function parseAlignments(sepCells: string[], colCount: number): Align[] {
  const out: Align[] = [];
  for (let i = 0; i < colCount; i += 1) {
    const cell = (sepCells[i] ?? "").trim();
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    out.push(left && right ? "center" : right ? "right" : "left");
  }
  return out;
}

/** Wrap `text` to `width` on word boundaries, hard-splitting an over-long word. Pure. */
export function wrapCell(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (cur) { lines.push(cur); cur = ""; }
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= width) cur += ` ${word}`;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Pad one cell line to width per its alignment. Pure. */
export function padAligned(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - text.length);
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const l = Math.floor(gap / 2);
    return " ".repeat(l) + text + " ".repeat(gap - l);
  }
  return text + " ".repeat(gap);
}

/** Column widths: max of header + cell content, capped at MAX_COL_WIDTH. Pure. */
export function columnWidths(headers: string[], rows: string[][], cap = MAX_COL_WIDTH): number[] {
  return headers.map((h, ci) => {
    const dataMax = rows.reduce((acc, r) => Math.max(acc, (r[ci] ?? "").length), h.length);
    return Math.min(Math.max(1, dataMax), cap);
  });
}

/** Render one logical row (its cells may wrap) into bordered physical lines. Pure. */
function renderRow(cells: string[], widths: number[], aligns: Align[]): string[] {
  const wrapped = widths.map((w, ci) => wrapCell(cells[ci] ?? "", w));
  const height = Math.max(1, ...wrapped.map((c) => c.length));
  const lines: string[] = [];
  for (let row = 0; row < height; row += 1) {
    const parts = widths.map((w, ci) => padAligned(wrapped[ci]![row] ?? "", w, aligns[ci] ?? "left"));
    lines.push(`│ ${parts.join(" │ ")} │`);
  }
  return lines;
}

/**
 * Lay out a full GFM table into bordered, aligned terminal lines:
 *   ┌─┬─┐ / header / ├─┼─┤ / rows… / └─┴─┘. Cells wider than their column wrap.
 * Pure — returns the text lines TableView renders.
 */
export function layoutTable(headers: string[], rows: string[][], aligns: Align[], cap = MAX_COL_WIDTH): string[] {
  const widths = columnWidths(headers, rows, cap);
  const rule = (l: string, m: string, r: string): string => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const out: string[] = [rule("┌", "┬", "┐"), ...renderRow(headers, widths, aligns), rule("├", "┼", "┤")];
  for (const row of rows) out.push(...renderRow(row, widths, aligns));
  out.push(rule("└", "┴", "┘"));
  return out;
}
