import { parseTrace, type TraceLine } from "../trace/distill.js";
import type { Risk } from "../types.js";

// PAPER-GOVERNANCE-AUDIT — an externally-auditable export of every gated action,
// its kernel verdict, and its final resolution (arXiv:2604.14228 §12.5, EU AI Act
// oversight/transparency requirements). applySafetyGate (agent/dispatch-helpers.ts)
// logs one `gate` event per tool call at every exit point via gateAuditEvent(); this
// module parses those events back out of events.jsonl and formats the report.
// Read-only over the existing tamper-evident kernel log — no new store.

/** How a gated action was finally resolved, independent of the kernel's raw risk
 *  tier (a rule/auto-mode can tighten allow/ask → blocked; that distinction is
 *  itself governance-relevant, so both are recorded). */
export type GateResolution =
  | "allow"
  | "blocked"
  | "approved"
  | "denied"
  | "accept-edits-auto"
  | "full-access-auto"
  | "delegated-auto"
  | "kernel-unreachable";

export type GateAuditEvent = {
  kind: "gate";
  tool: string;
  action: string;
  /** The kernel's raw verdict; "unknown" only when assess() itself failed. */
  risk: Risk | "unknown";
  resolution: GateResolution;
};

/** Serialize one gate outcome as an `events.jsonl` event string (JSON-in-string,
 *  matching the existing `session_config` event convention). */
export function gateAuditEvent(e: Omit<GateAuditEvent, "kind">): string {
  return JSON.stringify({ kind: "gate", ...e });
}

export type GateRecord = GateAuditEvent & { lineNo: number; ts: number };

/** Parse `gate` events out of raw events.jsonl text (reuses the trace-distiller's
 *  outer-envelope parser). Non-gate / malformed lines are silently skipped —
 *  the log holds many other event kinds this export doesn't care about. */
export function parseGateEvents(jsonl: string): GateRecord[] {
  return parseTrace(jsonl).flatMap((line) => {
    const rec = parseGateLine(line);
    return rec ? [rec] : [];
  });
}

function parseGateLine(line: TraceLine): GateRecord | null {
  let inner: unknown;
  try {
    inner = JSON.parse(line.event);
  } catch {
    return null;
  }
  if (!isGateEvent(inner)) return null;
  return { ...inner, lineNo: line.lineNo, ts: line.ts };
}

const RISKS = new Set(["allow", "ask", "block", "unknown"]);
const RESOLUTIONS = new Set<GateResolution>([
  "allow", "blocked", "approved", "denied", "accept-edits-auto", "full-access-auto", "delegated-auto", "kernel-unreachable",
]);

function isGateEvent(v: unknown): v is GateAuditEvent {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "gate" &&
    typeof o.tool === "string" &&
    typeof o.action === "string" &&
    typeof o.risk === "string" && RISKS.has(o.risk) &&
    typeof o.resolution === "string" && RESOLUTIONS.has(o.resolution as GateResolution)
  );
}

export type AuditSummary = {
  total: number;
  byRisk: Record<string, number>;
  byResolution: Record<string, number>;
  since?: string;
};

/** Tally records by kernel risk and by final resolution. */
export function summarizeGateRecords(records: GateRecord[]): AuditSummary {
  const byRisk: Record<string, number> = {};
  const byResolution: Record<string, number> = {};
  for (const r of records) {
    byRisk[r.risk] = (byRisk[r.risk] ?? 0) + 1;
    byResolution[r.resolution] = (byResolution[r.resolution] ?? 0) + 1;
  }
  return { total: records.length, byRisk, byResolution };
}

/** Keep only records at/after `sinceEpochSecs` (inclusive). */
export function filterSince(records: GateRecord[], sinceEpochSecs: number): GateRecord[] {
  return records.filter((r) => r.ts >= sinceEpochSecs);
}

function countTable(counts: Record<string, number>): string {
  const keys = Object.keys(counts).sort();
  return keys.map((k) => `| ${k} | ${counts[k]} |`).join("\n");
}

/** Render the external-review markdown report: summary counts + a chronological
 *  table of every gated action (timestamp, tool, risk, resolution, action). */
export function formatAuditReport(records: GateRecord[]): string {
  const summary = summarizeGateRecords(records);
  const rows = records
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((r) => {
      const when = r.ts > 0 ? new Date(r.ts * 1000).toISOString() : "(no ts)";
      return `| ${when} | ${r.tool} | ${r.risk} | ${r.resolution} | ${r.action.replace(/\|/g, "\\|")} |`;
    })
    .join("\n");

  return [
    "# Vanta governance audit export",
    "",
    "Every gated action the kernel assessed, its verdict, and how it was finally resolved — for external review (EU AI Act oversight/transparency; arXiv:2604.14228 §12.5). Sourced from the tamper-evident `.vanta/events.jsonl` chain.",
    "",
    `**Total gated actions:** ${summary.total}`,
    "",
    "## By kernel verdict",
    "",
    "| risk | count |",
    "|---|--:|",
    countTable(summary.byRisk) || "| (none) | 0 |",
    "",
    "## By final resolution",
    "",
    "| resolution | count |",
    "|---|--:|",
    countTable(summary.byResolution) || "| (none) | 0 |",
    "",
    "## Chronological log",
    "",
    "| when | tool | risk | resolution | action |",
    "|---|---|---|---|---|",
    rows || "| (none) | | | | |",
    "",
  ].join("\n");
}
