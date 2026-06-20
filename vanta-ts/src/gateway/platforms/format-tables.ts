// MSG-TABLE-DEGRADE — GFM pipe tables → mobile-readable bullets.
// Plain-text chat platforms (IRC, ntfy, iMessage, Signal) have no table syntax,
// so a `| a | b |` table with a `|---|---|` separator renders as backslash-pipe
// noise. The agent emits tables constantly. `degradeTables` detects a table block
// (header row + separator row + data rows) in PLAIN-dialect prose and reformats
// each data row into a bold heading (the first/label column) + a `key: value`
// bulleted list keyed by the header cells.
//
// PURE. Runs on prose only — the caller (formatForDialect) has already masked
// fenced/inline code to placeholders, so a code fence containing pipes never
// reaches this and is never degraded. Non-table text passes through unchanged.

/** A parsed table block: header cells + data rows (each row = ordered cells). */
type Table = { headers: string[]; rows: string[][] };

// A separator row is the GFM alignment line: each cell is dashes with optional
// leading/trailing colons (`---`, `:--`, `--:`, `:-:`), at least one dash.
const SEP_CELL = /^:?-+:?$/;

/** Split one table line into trimmed cells, dropping leading/trailing pipe edges. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

/** True when a line is a GFM table row (a trimmed line containing a pipe). */
function isTableRow(line: string | undefined): line is string {
  return line !== undefined && line.trim().includes("|");
}

/** True when a split row is a GFM separator (≥1 cell, every cell dashes+colons). */
function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => SEP_CELL.test(c));
}

/**
 * Parse a header line + separator line + the following data lines into a Table,
 * or `null` if the header/separator don't form a valid GFM table. Pure.
 * `dataLines` are the raw lines after the separator (consumed until a non-row).
 */
function parseTable(header: string, separator: string, dataLines: string[]): Table | null {
  const headers = splitRow(header);
  const sepCells = splitRow(separator);
  if (!isSeparator(sepCells) || headers.length === 0) return null;
  const rows = dataLines.map(splitRow);
  return { headers, rows };
}

/**
 * Render one parsed table as bold-heading + bullet blocks. The first column of
 * each row is the bold heading; the remaining columns become `- key: value`
 * bullets keyed by the corresponding header. Ragged rows are tolerated: a missing
 * cell renders empty, an extra cell is keyed by its position. Pure.
 */
function renderTable(table: Table): string {
  const { headers, rows } = table;
  return rows
    .map((cells) => {
      const heading = cells[0] ?? "";
      const bullets: string[] = [];
      for (let i = 1; i < Math.max(cells.length, headers.length); i++) {
        const key = headers[i] ?? `Column ${i + 1}`;
        const value = cells[i] ?? "";
        bullets.push(`- ${key}: ${value}`);
      }
      return [`**${heading}**`, ...bullets].join("\n");
    })
    .join("\n\n");
}

/**
 * Reformat every GFM pipe table in `md` into bold-heading + bullet lists, leaving
 * all non-table text unchanged. A table = a row line, then a separator line, then
 * zero or more row lines. Lines that aren't a valid table block pass through
 * verbatim. Pure — call on prose only (code already masked by the caller).
 */
export function degradeTables(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (isTableRow(header) && sep !== undefined && isTableRow(sep)) {
      let end = i + 2;
      while (end < lines.length && isTableRow(lines[end])) end++;
      const table = parseTable(header, sep, lines.slice(i + 2, end));
      if (table) {
        out.push(renderTable(table));
        i = end;
        continue;
      }
    }
    out.push(header ?? "");
    i++;
  }
  return out.join("\n");
}
