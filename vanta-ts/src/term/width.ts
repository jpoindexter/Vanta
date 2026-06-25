// Width-responsive layout for every TUI menu/list. The terminal width is the
// budget: label columns size to the longest entry (capped) and the description /
// hint fills the rest — instead of a fixed clip (48/52/72…) that cramps a wide
// terminal and overflows a narrow one. dec-cognitive-load: the arbitrary clip is
// extraneous load — remove it. dec-krug: keep the description scannable, aligned
// into one column. Shared by ui/* menus and the repl text listings.

/** Current terminal width in columns, with a sane fallback (non-TTY / tests). */
export function termWidth(fallback = 100): number {
  const c = process.stdout.columns;
  return c && c > 0 ? c : fallback;
}

/** Plan a label + description two-column layout against a width budget. Pure
 *  given `width`: `nameCol` fits the longest label (+gap), capped at `nameCap`;
 *  `descW` takes the rest, floored at `minDesc` so it stays legible when narrow. */
export function planColumns(
  labels: readonly string[],
  opts: { width?: number; nameCap?: number; minDesc?: number; gap?: number } = {},
): { nameCol: number; descW: number } {
  const width = opts.width ?? termWidth();
  const nameCap = opts.nameCap ?? 32;
  const minDesc = opts.minDesc ?? 24;
  const gap = opts.gap ?? 2;
  const longest = labels.length ? Math.max(...labels.map((l) => l.length)) : 0;
  const nameCol = Math.min(nameCap, longest + gap);
  const descW = Math.max(minDesc, width - nameCol - gap - 2);
  return { nameCol, descW };
}

/** Ellipsis-clip to `width`, only when it actually overflows. */
export function clipTo(s: string, width: number): string {
  return s.length > width ? `${s.slice(0, Math.max(1, width - 1))}…` : s;
}
