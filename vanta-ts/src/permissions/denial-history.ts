import type { PreferenceSignal } from "../preferences/signals.js";
import { readPreferenceSignals } from "../preferences/signals.js";
import { formatMessageTime } from "../term/message-time.js";

// VANTA-AUTO-MODE-DENIALS — recent-denials view.
//
// READ-ONLY surfacing layer: extract + format the most recently DENIED/blocked
// tool actions from the preference-signal log (`~/.vanta/preferences.jsonl`)
// so the operator can review what auto-mode / the kernel / the rules blocked.
// This module NEVER alters a permission decision — it only reads history.
//
// The denial source is `signalFromApprovalDecision({approved:false, ...})` rows
// (PREFERENCE-SIGNALS): a human denial records `chosen.value === "deny"` with
// provenance.source "human_approval", `context` shaped "<reason>: <action>", and
// `provenance.toolName`. We read those rows, newest first, capped, and render a
// compact list. Pure + injectable: `extractDenials`/`formatDenials` take their
// inputs explicitly; `readRecentDenials` injects the signal-rows reader so it is
// best-effort ([] on read failure) and testable without touching the real store.

/** A single denied/blocked tool action, distilled for the recent-denials view. */
export type DenialRecord = {
  /** The tool whose action was denied ("(unknown)" when provenance lacks it). */
  tool: string;
  /** What was attempted (the action portion of the signal context). */
  action: string;
  /** Why it was denied (the reason portion of the signal context). */
  reason: string;
  /** Epoch-ms of the denial (parsed from the signal timestamp; 0 if unparsable). */
  ts: number;
};

/** Default number of recent denials to surface. */
export const DEFAULT_DENIAL_CAP = 20;

const UNKNOWN_TOOL = "(unknown)";
const UNKNOWN_REASON = "denied";
const UNKNOWN_ACTION = "(action unavailable)";

// Strip C0 (incl. ESC 0x1B), DEL, and C1 control chars so stored history content
// can never inject a terminal escape sequence when rendered. \u escapes (not raw
// bytes) for safety; mirrors term/spinner-verbs.ts.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

function stripControl(value: string): string {
  return value.replace(CONTROL_CHARS, "").trim();
}

/** True when a preference-signal row represents a human DENIAL (`chosen` = deny). */
function isDenialRow(row: PreferenceSignal): boolean {
  return row.kind === "approval_decision" && row.chosen.value === "deny";
}

/**
 * Split a signal `context` ("<reason>: <action>") into reason + action.
 * The reason is everything before the first ": "; the action is the remainder.
 * A context with no separator is treated as the action (reason unknown).
 */
function splitContext(context: string): { reason: string; action: string } {
  const sep = context.indexOf(": ");
  if (sep === -1) return { reason: UNKNOWN_REASON, action: context };
  return { reason: context.slice(0, sep), action: context.slice(sep + 2) };
}

function toRecord(row: PreferenceSignal): DenialRecord {
  const { reason, action } = splitContext(row.context);
  const ts = Date.parse(row.timestamp);
  return {
    tool: row.provenance.toolName ?? UNKNOWN_TOOL,
    action: action || UNKNOWN_ACTION,
    reason: reason || UNKNOWN_REASON,
    ts: Number.isNaN(ts) ? 0 : ts,
  };
}

/**
 * Distil the denial records from a list of preference-signal rows: keep only the
 * denied rows, newest first (by timestamp), capped at `cap` (default 20). Pure.
 */
export function extractDenials(
  rows: readonly PreferenceSignal[],
  cap: number = DEFAULT_DENIAL_CAP,
): DenialRecord[] {
  const limit = cap > 0 ? cap : DEFAULT_DENIAL_CAP;
  return rows
    .filter(isDenialRow)
    .map(toRecord)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

/** One rendered denial line: "✘ <tool> <action> — <reason> (<relative time>)". */
function formatRecord(record: DenialRecord, nowMs: number): string {
  const tool = stripControl(record.tool) || UNKNOWN_TOOL;
  const action = stripControl(record.action) || UNKNOWN_ACTION;
  const reason = stripControl(record.reason) || UNKNOWN_REASON;
  const when = record.ts > 0 ? formatMessageTime(record.ts, nowMs) : "unknown time";
  return `  ✘ ${tool} ${action} — ${reason} (${when})`;
}

/**
 * Render the compact recent-denials view. Empty list → a single
 * "no recent denials" line. Control/ANSI chars are stripped from every field so
 * stored history can't inject escapes. `nowMs` is injected (deterministic).
 */
export function formatDenials(records: readonly DenialRecord[], nowMs: number): string {
  if (records.length === 0) return "  no recent denials";
  return ["  recent denials (newest first):", ...records.map((r) => formatRecord(r, nowMs))].join("\n");
}

/** Injected dependencies for `readRecentDenials` (signal-rows reader + clock). */
export type DenialHistoryDeps = {
  readSignals: () => Promise<readonly PreferenceSignal[]>;
  nowMs: number;
  cap?: number;
};

/**
 * Best-effort: read the signal rows, extract the capped newest-first denials, and
 * render the compact view. Any read failure degrades to the empty view ([] →
 * "no recent denials") rather than throwing — this is a READ-ONLY display path.
 */
export async function readRecentDenials(deps: DenialHistoryDeps): Promise<string> {
  let rows: readonly PreferenceSignal[] = [];
  try {
    rows = await deps.readSignals();
  } catch {
    rows = [];
  }
  return formatDenials(extractDenials(rows, deps.cap), deps.nowMs);
}

/** Live default: reads the real `~/.vanta/preferences.jsonl` via the signals reader. */
export function defaultDenialHistoryDeps(
  nowMs: number,
  env: NodeJS.ProcessEnv = process.env,
  cap: number = DEFAULT_DENIAL_CAP,
): DenialHistoryDeps {
  return { readSignals: () => readPreferenceSignals(env), nowMs, cap };
}
