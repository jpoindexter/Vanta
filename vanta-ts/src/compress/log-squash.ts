// Log/text squash, native. Two cheap, high-value transforms for shell + build
// output: collapse runs of identical lines into `<line> (×N)`, and shrink deep
// stack traces to the top frames. Pure. Lossy — the original is in CCR.

const STACK_FRAME = /^\s+(at\s|File\s|\s*#\d+\s)/; // JS/Python/generic frame
const KEEP_FRAMES = 3;

/** Collapse consecutive duplicate lines into a single `line (×N)`. Pure. */
function collapseDuplicates(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    let n = 1;
    while (i + n < lines.length && lines[i + n] === line) n++;
    out.push(n > 1 ? `${line} (×${n})` : line);
    i += n;
  }
  return out;
}

/** Render one frame run: top KEEP_FRAMES + a count when deep, else verbatim. Pure. */
function renderFrameRun(lines: string[], start: number, n: number): string[] {
  if (n <= KEEP_FRAMES + 1) return lines.slice(start, start + n).map((l) => l ?? "");
  const head = lines.slice(start, start + KEEP_FRAMES).map((l) => l ?? "");
  return [...head, `    … ${n - KEEP_FRAMES} more frames`];
}

/** Collapse runs of stack frames to the top KEEP_FRAMES + a count. Pure. */
function collapseStacks(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!STACK_FRAME.test(lines[i] ?? "")) {
      out.push(lines[i] ?? "");
      i++;
      continue;
    }
    let n = 0;
    while (i + n < lines.length && STACK_FRAME.test(lines[i + n] ?? "")) n++;
    out.push(...renderFrameRun(lines, i, n));
    i += n;
  }
  return out;
}

/** Collapse runs of 2+ blank lines into a single blank line. Pure. */
function collapseBlanks(lines: string[]): string[] {
  const out: string[] = [];
  let blank = false;
  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank && blank) continue; // skip the run after the first blank
    out.push(line);
    blank = isBlank;
  }
  return out;
}

/**
 * Squash log/text output: collapse blank-line runs (the real win on transcripts
 * and verbose output), then duplicate lines, then deep stack traces. Pure.
 */
export function squashLogs(raw: string): string {
  const lines = raw.split("\n");
  return collapseStacks(collapseDuplicates(collapseBlanks(lines))).join("\n");
}
