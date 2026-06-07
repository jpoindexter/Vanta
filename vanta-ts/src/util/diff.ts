export type DiffLine = { type: "add" | "remove" | "context"; text: string };

const CONTEXT_LINES = 3;
const MAX_LINES = 400;

type Op = { type: "keep" | "add" | "remove"; line: string };

function lcs(a: string[], b: string[]): [number, number][] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { pairs.unshift([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  return pairs;
}

function buildOps(a: string[], b: string[], common: [number, number][]): Op[] {
  const ops: Op[] = [];
  let ai = 0, bi = 0;
  for (const [li, lj] of common) {
    while (ai < li) ops.push({ type: "remove", line: a[ai++]! });
    while (bi < lj) ops.push({ type: "add", line: b[bi++]! });
    ops.push({ type: "keep", line: a[ai++]! });
    bi++;
  }
  while (ai < a.length) ops.push({ type: "remove", line: a[ai++]! });
  while (bi < b.length) ops.push({ type: "add", line: b[bi++]! });
  return ops;
}

/** Indices to keep: every non-keep op + `ctx` lines of context around it. Pure. */
function windowedKeep(ops: Op[], ctx: number): Set<number> {
  const keep = new Set<number>();
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.type === "keep") continue;
    for (let d = -ctx; d <= ctx; d++) {
      const idx = i + d;
      if (idx >= 0 && idx < ops.length) keep.add(idx);
    }
  }
  return keep;
}

function withContext(ops: Op[], ctx: number): DiffLine[] {
  const keep = windowedKeep(ops, ctx);
  if (keep.size === 0) return [];
  const result: DiffLine[] = [];
  let skipped = false;
  for (let i = 0; i < ops.length; i++) {
    if (!keep.has(i)) { skipped = true; continue; }
    if (skipped) result.push({ type: "context", text: "···" });
    skipped = false;
    const op = ops[i]!;
    result.push({ type: op.type === "keep" ? "context" : op.type, text: op.line });
  }
  return result;
}

/**
 * Compute a unified-style diff between two text strings. Returns an empty
 * array for identical content or files exceeding MAX_LINES (diff skipped).
 */
export function computeDiff(before: string, after: string): DiffLine[] {
  if (before === after) return [];
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  if (a.length > MAX_LINES || b.length > MAX_LINES) return [];
  const common = lcs(a, b);
  const ops = buildOps(a, b, common);
  return withContext(ops, CONTEXT_LINES);
}
