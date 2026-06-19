import { estTokens } from "winnow";

// SEARCH-RESULT-DENSIFY — a SEPARATE LOSSLESS lane, distinct from the lossy
// COMPRESS_TOOLS allow-list in apply.ts. grep/search tools emit one line per
// match as `path:line:content`; a path-heavy result repeats the same long path
// string (plus the `:` framing) on every line. Densifying groups consecutive
// same-path matches under one bare-path header with indented `line: content`
// pairs — the path is written once, not per match. Every line number and every
// content byte survives verbatim; this is reformatting, not compression.
//
// Losslessness is enforced at runtime, not merely asserted by tests: densify
// re-expands its own output and byte-compares it to the input. If the round
// trip is not exact (e.g. a path that itself contains the `:line:` framing, or
// any shape the parser can't reconstruct unambiguously), densify returns the
// input untouched. So a precision view is never corrupted — worst case it is
// simply not densified.

/** Minimum consecutive matches before grouping is worth it. The card fires on >=5. */
const MIN_MATCHES = 5;

/** Two-space indent for grouped match lines under a path header. */
const INDENT = "  ";

/** A parsed grep/search match line: path + line number + content. */
interface Match {
  path: string;
  lineNo: string;
  content: string;
}

/**
 * Parse one output line as `path:lineNo:content`. The path is taken
 * non-greedily up to the FIRST `:<digits>:` boundary (ripgrep/grep
 * `--no-heading` shape). Returns null for any line that isn't this shape
 * (headers, blank lines, `(no matches)`, ranked `[score] source: snippet`),
 * which keeps those lines verbatim. Pure.
 */
function parseMatch(line: string): Match | null {
  const m = /^(.*?):(\d+):(.*)$/.exec(line);
  if (!m) return null;
  const path = m[1];
  const lineNo = m[2];
  const content = m[3];
  if (path === undefined || lineNo === undefined || content === undefined) return null;
  // A leading-empty path (line began with `:`) can't be reconstructed as a
  // bare header unambiguously — leave it verbatim.
  if (path.length === 0) return null;
  return { path, lineNo, content };
}

/** Re-expand one grouped block back to original `path:lineNo:content` lines. Pure. */
function expandGroup(path: string, body: string[]): string[] {
  return body.map((entry) => {
    // entry is `<lineNo>: <content>` (indent already stripped by the caller).
    const m = /^(\d+): (.*)$/.exec(entry);
    if (!m || m[1] === undefined || m[2] === undefined) return entry; // not our shape; round-trip check catches drift
    return `${path}:${m[1]}:${m[2]}`;
  });
}

/** Collect the maximal run of consecutive same-path matches starting at `start`. Pure. */
function collectRun(lines: string[], start: number, path: string): Match[] {
  const run: Match[] = [];
  for (let k = start; k < lines.length; k++) {
    const next = parseMatch(lines[k] ?? "");
    if (!next || next.path !== path) break;
    run.push(next);
  }
  return run;
}

/** Emit one run: grouped header+body when long enough, else verbatim flat lines. Pure. */
function emitRun(run: Match[], out: string[]): void {
  const first = run[0];
  if (first && run.length >= MIN_MATCHES) {
    out.push(first.path);
    for (const match of run) out.push(`${INDENT}${match.lineNo}: ${match.content}`);
    return;
  }
  for (const match of run) out.push(`${match.path}:${match.lineNo}:${match.content}`);
}

/**
 * Group consecutive same-path matches. Runs of >= MIN_MATCHES under one path
 * collapse to a header + indented `line: content` body; shorter runs and
 * unparseable lines stay verbatim. Pure — no I/O, no env. The caller decides
 * whether the result is actually smaller and round-trips.
 */
function groupLines(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const first = parseMatch(line);
    if (!first) {
      out.push(line);
      i += 1;
      continue;
    }
    const run = collectRun(lines, i, first.path);
    emitRun(run, out);
    i += run.length;
  }
  return out;
}

/**
 * Reverse `densify`: re-expand grouped blocks to flat `path:line:content`
 * lines. A bare-path header is any line that is neither indented nor itself a
 * `path:line:content` match; its following indented lines are its body. Pure.
 * Used by both the agent (to recover the flat view) and the internal
 * round-trip guard.
 */
export function undensify(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const isIndented = line.startsWith(INDENT);
    const isMatch = parseMatch(line) !== null;
    if (isIndented || isMatch || line.length === 0) {
      // Not a header — pass through verbatim (indented orphans shouldn't occur
      // in well-formed densified text, but verbatim keeps us safe).
      out.push(line);
      i += 1;
      continue;
    }
    // Header candidate: collect the indented body that follows.
    const path = line;
    const body: string[] = [];
    let j = i + 1;
    let bodyLine = lines[j];
    while (bodyLine !== undefined && bodyLine.startsWith(INDENT)) {
      body.push(bodyLine.slice(INDENT.length));
      j += 1;
      bodyLine = lines[j];
    }
    if (body.length === 0) {
      out.push(line); // a non-match, non-header line with no body — verbatim
      i += 1;
      continue;
    }
    out.push(...expandGroup(path, body));
    i = j;
  }
  return out.join("\n");
}

export interface DensifyResult {
  output: string;
  tokensSaved: number;
}

/**
 * Losslessly densify grep/search output. Fires only when there are at least
 * MIN_MATCHES parseable matches total. Groups consecutive same-path matches,
 * then GUARDS losslessness by re-expanding the result and byte-comparing it to
 * the input: any mismatch (or no real shrink) returns the input untouched and
 * tokensSaved 0. Never throws.
 */
export function densifySearchResult(output: string): DensifyResult {
  try {
    const lines = output.split("\n");
    const matchCount = lines.reduce((n, l) => n + (parseMatch(l) ? 1 : 0), 0);
    if (matchCount < MIN_MATCHES) return { output, tokensSaved: 0 };

    const grouped = groupLines(lines).join("\n");
    // No grouping happened (no run reached MIN_MATCHES) → nothing to gain.
    if (grouped === output) return { output, tokensSaved: 0 };
    // Losslessness guard: the densified form MUST re-expand to the exact input.
    if (undensify(grouped) !== output) return { output, tokensSaved: 0 };

    const tokensSaved = Math.max(0, estTokens(output) - estTokens(grouped));
    if (tokensSaved <= 0) return { output, tokensSaved: 0 };
    return { output: grouped, tokensSaved };
  } catch {
    return { output, tokensSaved: 0 };
  }
}

// Tools whose output is the `path:line:content` shape this densifier groups.
// grep_files (ripgrep/grep `--no-heading`) is the emitter — glob_files returns
// bare paths (no line:content), code_search/life_search use `[score] source:
// snippet`, so they never parse here and are correctly left out. The transform
// is also self-guarding (round-trip check), so any future tool added here that
// doesn't fit the shape is simply a no-op rather than a corruption risk.
export const DENSIFY_TOOLS: ReadonlySet<string> = new Set(["grep_files"]);

/** Whether a tool's output should run through the lossless densifier. Pure. */
export function shouldDensifyTool(name: string): boolean {
  return DENSIFY_TOOLS.has(name);
}
