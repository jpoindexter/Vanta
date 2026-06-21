// VANTA-MONITOR — pure line-by-line monitor matcher + match-state accumulation.
//
// A monitor watches a streaming command's output line by line against
// operator-defined patterns ("ERROR" -> alert, "Listening on" -> ready) and
// reports which lines matched which patterns plus a running tally. This file is
// the PURE reactive layer: parse patterns, match one (ANSI-stripped) line, fold
// matches into state, and summarize. NO process I/O lives here.
//
// WIRING (the live boundary, not built this round): a `monitor` tool — or
// shell-cmd's streaming/background mode — owns the process stream. For each
// stdout/stderr line it emits, the host calls
//   state = accumulateMatch(state, line, patterns)
// and surfaces summarizeMonitor(state) / the new matches. The process stream is
// the documented, INJECTED boundary; this module never touches a child process.
//
// SECURITY (ReDoS): a pattern is matched as a LITERAL SUBSTRING, never compiled
// to a regex. This is a deliberate choice — a literal substring scan is O(n·m),
// cannot backtrack, and so a hostile pattern (`(a+)+$`) can never hang the
// matcher. We additionally cap the pattern length (PATTERN_MAX) and the matched
// line length (LINE_MAX) so neither input can grow the work unbounded. The line
// is ANSI/control-stripped before matching so escape sequences can't smuggle a
// match or inject terminal control codes.

import { stripKeepNewlines } from "../term/bash-io.js";

/** A pattern the monitor watches each output line for. */
export type MonitorPattern = {
  /** Human label shown in matches/tally (e.g. "errors"). */
  label: string;
  /** Literal substring to look for in each (stripped) line. */
  pattern: string;
  /** What a match means; drives summary + the `ready` flag. Default "alert". */
  kind: MonitorKind;
};

/** Match semantics for a pattern. `ready` flips `MonitorState.ready` on match. */
export type MonitorKind = "ready" | "alert" | "info";

/** One pattern hit on one line. */
export type MonitorMatch = { label: string; kind: MonitorKind; line: string };

/** Accumulated monitor state across every line seen so far. */
export type MonitorState = {
  /** Every match, in arrival order. */
  matches: MonitorMatch[];
  /** Per-label hit count. */
  counts: Record<string, number>;
  /** True once any "ready" pattern has matched. */
  ready: boolean;
};

const DEFAULT_KIND: MonitorKind = "alert";
const VALID_KINDS = new Set<MonitorKind>(["ready", "alert", "info"]);
/** Max chars of a pattern (longer = dropped as invalid). */
const PATTERN_MAX = 200;
/** Max chars of a line we scan (longer is clipped before matching). */
const LINE_MAX = 4000;

/** The empty starting state for a fresh monitor. */
export function emptyMonitorState(): MonitorState {
  return { matches: [], counts: {}, ready: false };
}

/** Narrow an unknown value to a MonitorKind, falling back to the default. */
function toKind(raw: unknown): MonitorKind {
  return typeof raw === "string" && VALID_KINDS.has(raw as MonitorKind) ? (raw as MonitorKind) : DEFAULT_KIND;
}

/** A valid pattern string: non-empty after trim, within the length cap. */
function isUsablePattern(pattern: unknown): pattern is string {
  return typeof pattern === "string" && pattern.trim().length > 0 && pattern.length <= PATTERN_MAX;
}

/** Coerce one spec (string or object) into a MonitorPattern, or null if invalid. */
function toPattern(spec: unknown): MonitorPattern | null {
  if (typeof spec === "string") {
    return isUsablePattern(spec) ? { label: spec.trim(), pattern: spec.trim(), kind: DEFAULT_KIND } : null;
  }
  if (spec && typeof spec === "object") {
    const obj = spec as Record<string, unknown>;
    if (!isUsablePattern(obj.pattern)) return null;
    const pattern = (obj.pattern as string).trim();
    const label = typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : pattern;
    return { label, pattern, kind: toKind(obj.kind) };
  }
  return null;
}

/**
 * Parse operator-supplied pattern specs into validated MonitorPatterns.
 * Tolerant: a bare string "ERROR" becomes an alert pattern; an object is
 * validated (needs a usable `pattern`, optional `label`/`kind`); anything
 * invalid (empty, over-length, wrong type, null) is silently dropped. A
 * non-array input yields []. No patterns in -> [] out (so no matches downstream).
 */
export function parseMonitorPatterns(specs: unknown): MonitorPattern[] {
  if (!Array.isArray(specs)) return [];
  const out: MonitorPattern[] = [];
  for (const spec of specs) {
    const p = toPattern(spec);
    if (p) out.push(p);
  }
  return out;
}

/** Strip ANSI/control escapes and clip one line to LINE_MAX before matching. */
function cleanLine(line: string): string {
  const stripped = stripKeepNewlines(line).replace(/\r?\n/g, " ").trim();
  return stripped.length > LINE_MAX ? stripped.slice(0, LINE_MAX) : stripped;
}

/**
 * The patterns a single line matches. The line is ANSI/control-stripped first,
 * then each pattern is tested as a case-sensitive LITERAL SUBSTRING (no regex ->
 * no ReDoS). No patterns -> []. No match -> []. The returned `line` is the
 * cleaned (stripped/clipped) line so the host surfaces safe text.
 */
export function matchLine(line: string, patterns: readonly MonitorPattern[]): MonitorMatch[] {
  if (patterns.length === 0) return [];
  const clean = cleanLine(line);
  if (!clean) return [];
  const out: MonitorMatch[] = [];
  for (const p of patterns) {
    if (clean.includes(p.pattern)) out.push({ label: p.label, kind: p.kind, line: clean });
  }
  return out;
}

/**
 * Fold one output line into the monitor state: append every match, bump the
 * per-label count, and set `ready` when a "ready" pattern matched. Pure — returns
 * the NEXT state, never mutates the input. No matches -> a state equal in content
 * to the input (a fresh object, original untouched).
 */
export function accumulateMatch(state: MonitorState, line: string, patterns: readonly MonitorPattern[]): MonitorState {
  const hits = matchLine(line, patterns);
  if (hits.length === 0) return { matches: [...state.matches], counts: { ...state.counts }, ready: state.ready };
  const counts = { ...state.counts };
  let ready = state.ready;
  for (const hit of hits) {
    counts[hit.label] = (counts[hit.label] ?? 0) + 1;
    if (hit.kind === "ready") ready = true;
  }
  return { matches: [...state.matches, ...hits], counts, ready };
}

/** Sum hits across labels of a given kind, using each match's kind. */
function countByKind(state: MonitorState, kind: MonitorKind): number {
  return state.matches.reduce((n, m) => n + (m.kind === kind ? 1 : 0), 0);
}

/**
 * A compact one-line summary of the monitor so far, e.g.
 *   "✓ ready · 2 alerts · 1 info"
 * Ready is shown first when set; alert/info segments appear only when non-zero.
 * No matches and not ready -> "waiting · no matches yet".
 */
export function summarizeMonitor(state: MonitorState): string {
  const segments: string[] = [];
  segments.push(state.ready ? "✓ ready" : "… not ready");
  const alerts = countByKind(state, "alert");
  const info = countByKind(state, "info");
  if (alerts > 0) segments.push(`${alerts} ${alerts === 1 ? "alert" : "alerts"}`);
  if (info > 0) segments.push(`${info} info`);
  if (!state.ready && state.matches.length === 0) return "waiting · no matches yet";
  return segments.join(" · ");
}
