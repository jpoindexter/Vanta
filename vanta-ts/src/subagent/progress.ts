import { basename } from "node:path";

// VANTA-AGENT-SUMMARY — pure summary-state helpers for a running sub-agent's
// live progress pill. No I/O, no LLM, no clock of its own: the caller injects
// `now`. The side-query that produces the raw text lives in progress-reporter.ts
// behind an injected provider; everything here is deterministic and unit-tested.

/** How often a running sub-agent's summary may refresh (the ~30s throttle). */
export const SUMMARY_INTERVAL_MS = 30_000;

/** Upper bound on summary words — the pill must stay glanceable. */
const MAX_WORDS = 5;
const MIN_WORDS = 3;
const MAX_CHARS = 40;

/** A recent worker tool call, reduced to the bits that name the work. */
export type RecentCall = { name: string; args: Record<string, unknown> };

/** Present-tense verbs keyed by tool name — used to keep summaries action-first. */
const TOOL_VERBS: Record<string, string> = {
  write_file: "Editing",
  edit_file: "Editing",
  read_file: "Reading",
  grep_files: "Searching",
  glob_files: "Searching",
  shell_cmd: "Running",
  run_code: "Running",
  web_fetch: "Fetching",
  web_search: "Searching",
};

/** Arg keys that tend to carry the specific target (a path, symbol, or query). */
const TARGET_KEYS = ["path", "file", "target", "pattern", "query", "url", "command"];

function firstString(args: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Trim a raw target value to its most nameable token (a basename for paths). */
function nameOf(raw: string): string {
  const head = raw.split(/\s+/)[0] ?? raw;
  const candidate = head.includes("/") ? basename(head) : head;
  return candidate.length > 24 ? `${candidate.slice(0, 23)}…` : candidate;
}

/**
 * Derive the single most specific "what is it touching" hint from the worker's
 * recent tool calls — a filename, symbol, or query, newest call first. Returns
 * null when nothing nameable is present (the summary then stays generic).
 */
export function specificHint(calls: RecentCall[]): string | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    const target = firstString(call.args, TARGET_KEYS);
    if (!target) continue;
    const verb = TOOL_VERBS[call.name] ?? "Working";
    return `${verb} ${nameOf(target)}`;
  }
  return null;
}

/** Strip wrapping quotes/punctuation and collapse whitespace. */
function clean(raw: string): string {
  return raw
    .replace(/^[\s"'`*\-•]+/, "")
    .replace(/[\s"'`*.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VAGUE = new Set(["working", "thinking", "processing", "doing", "running", "busy", "task"]);

/** A summary is too vague when it is a single generic word (no specific target). */
export function isVague(summary: string): boolean {
  const words = summary.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0 || (words.length === 1 && VAGUE.has(words[0]!));
}

/**
 * Reduce a raw side-query reply to a 3–5 word present-tense pill. When the raw
 * text is empty or too vague, fall back to the specific hint derived from recent
 * tool calls so the pill always names something concrete when it can.
 */
export function toSummary(raw: string, fallbackHint?: string | null): string {
  const cleaned = clean(raw);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS || isVague(cleaned)) {
    return fallbackHint ? clipWords(fallbackHint) : clipWords(cleaned);
  }
  return clipWords(cleaned);
}

function clipWords(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const joined = words.join(" ");
  return joined.length > MAX_CHARS ? `${joined.slice(0, MAX_CHARS - 1)}…` : joined;
}

/**
 * True when enough time has passed to refresh a summary. `lastAt` is null before
 * the first update (so the first tick always fires). Pure — `now` is injected.
 */
export function dueForUpdate(lastAt: number | null, now: number, intervalMs = SUMMARY_INTERVAL_MS): boolean {
  return lastAt === null || now - lastAt >= intervalMs;
}
