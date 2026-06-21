// VANTA-USAGE-MERGED — pure view-model for the merged `/usage` view: one block
// combining the session cost breakdown, session stats (turns + duration), top
// tool usage, and an activity sparkline, organized as labeled sections instead
// of separate `/cost` + `/stats` commands.
//
// Pure + formatter-only (no I/O, no clock, no ctx): the live `/usage` handler
// (repl/context-cmds.ts `usage`) is where this WOULD be called — it would pass
// `{ sessionCost: ctx.state.sessionCost, turns: ctx.state.turnIndex, toolCounts,
// durationMs: now - Date.parse(ctx.state.started), activitySeries }` into
// `buildUsageView(...)` and emit the returned block. `toolCounts`/`activitySeries`
// are aggregated by the host across the session (not yet on ReplState); when
// absent the Tools/Activity sections degrade out, matching clarity-gate.
//
// Reuses the shipped cost formatter (`formatSessionCost`) for the Cost section
// and the shipped labeled sparkline (`labeledSparkline`) for the Activity row,
// rather than re-deriving either.

import { formatSessionCost, type SessionCost } from "../pricing.js";
import { labeledSparkline } from "../term/sparkline.js";

/** Everything the merged `/usage` view renders, gathered by the host. */
export type UsageData = {
  /** Running session cost split (local free vs frontier metered). Absent → no Cost section. */
  sessionCost?: SessionCost;
  /** Number of completed turns this session. */
  turns: number;
  /** Tool name → invocation count this session. Empty → "no tools used yet". */
  toolCounts: Record<string, number>;
  /** Session wall-clock duration in milliseconds. */
  durationMs: number;
  /** Per-bucket activity counts driving the sparkline. Absent/empty → no Activity section. */
  activitySeries?: number[];
};

/** Default number of tools shown in the Tools section. */
const DEFAULT_TOP_N = 5;

/** A line with no usage on any axis — the minimal empty view. */
const EMPTY_VIEW = "  (no usage yet)";

/** True when there is genuinely nothing to report on any axis. */
function isEmptyUsage(data: UsageData): boolean {
  const hasCost = !!data.sessionCost && (data.sessionCost.localTurns > 0 || data.sessionCost.frontierTurns > 0);
  const hasTools = Object.keys(data.toolCounts).length > 0;
  const hasActivity = !!data.activitySeries && data.activitySeries.length > 0;
  return data.turns === 0 && data.durationMs <= 0 && !hasCost && !hasTools && !hasActivity;
}

/**
 * Top-N tools by invocation count, highest first. Ties break alphabetically so
 * the ordering is deterministic. `n` clamps to ≥0 (negative → empty). Pure.
 */
export function topTools(toolCounts: Record<string, number>, n = DEFAULT_TOP_N): Array<[string, number]> {
  const cap = Math.max(0, Math.floor(n));
  return Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cap);
}

/** Compact human duration: `Xh Ym`, `Xm Ys`, or `Xs`. Negatives → `0s`. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** The Cost section: a label + the reused session-cost line. */
function costSection(c: SessionCost): string[] {
  return ["  Cost", `    ${formatSessionCost(c)}`];
}

/** The Session section: turn count + compact duration. */
function sessionSection(turns: number, durationMs: number): string[] {
  const t = `${turns} turn${turns === 1 ? "" : "s"}`;
  return ["  Session", `    ${t} · ${formatDuration(durationMs)}`];
}

/** The Tools section: top-N tool counts, or a placeholder when none ran. */
function toolsSection(toolCounts: Record<string, number>): string[] {
  const top = topTools(toolCounts);
  if (top.length === 0) return ["  Tools", "    (no tools used yet)"];
  const rows = top.map(([name, count]) => `    ${name} ×${count}`);
  return ["  Tools", ...rows];
}

/** The Activity section: the reused labeled sparkline over the series. */
function activitySection(series: number[]): string[] {
  return ["  Activity", `    ${labeledSparkline("activity", series)}`];
}

/**
 * Render the merged `/usage` view as labeled sections. Empty/zero data → the
 * minimal "no usage yet" line. Otherwise: Cost (when a session cost is present),
 * Session (turns + duration), Tools (top counts or placeholder), and Activity
 * (when a series is present). Pure — no I/O, no clock.
 */
export function buildUsageView(data: UsageData): string {
  if (isEmptyUsage(data)) return EMPTY_VIEW;
  const sections: string[] = [];
  if (data.sessionCost && (data.sessionCost.localTurns > 0 || data.sessionCost.frontierTurns > 0)) {
    sections.push(...costSection(data.sessionCost));
  }
  sections.push(...sessionSection(data.turns, data.durationMs));
  sections.push(...toolsSection(data.toolCounts));
  if (data.activitySeries && data.activitySeries.length > 0) {
    sections.push(...activitySection(data.activitySeries));
  }
  return sections.join("\n");
}
