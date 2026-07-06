import { parseTrace } from "../trace/distill.js";

// PCLIP-ACTIVITY-FEED — a queryable who/what/why timeline over events.jsonl,
// instead of raw jsonl. Read-only over the existing tamper-evident log (same
// contract as governance/audit.ts): gate events surface tool + verdict +
// resolution; label-prefixed tool events surface tool + outcome; anything else
// is a note. Pure parse/filter/format; the command layer does the file I/O.

export type ActivityKind = "gate" | "tool" | "note";

export type ActivityItem = {
  ts: number;
  kind: ActivityKind;
  /** Who acted — the tool/label that produced the event. */
  who: string;
  /** What happened — the event body. */
  what: string;
  /** Gate events only: the kernel's verdict + the final resolution (the why). */
  risk?: string;
  resolution?: string;
};

type GateShape = { kind: "gate"; tool: string; action: string; risk: string; resolution: string };

function asGate(inner: unknown): GateShape | null {
  if (typeof inner !== "object" || inner === null) return null;
  const r = inner as Record<string, unknown>;
  const ok =
    r.kind === "gate" &&
    typeof r.tool === "string" &&
    typeof r.action === "string" &&
    typeof r.risk === "string" &&
    typeof r.resolution === "string";
  return ok ? (inner as GateShape) : null;
}

/** "label: rest" prefix split — the dominant tool-event convention. */
const LABEL_RE = /^([a-z0-9_-]+): (.*)$/is;

function toItem(ts: number, event: string): ActivityItem {
  try {
    const gate = asGate(JSON.parse(event));
    if (gate) return { ts, kind: "gate", who: gate.tool, what: gate.action, risk: gate.risk, resolution: gate.resolution };
  } catch {
    /* not JSON — fall through to the label conventions */
  }
  const m = LABEL_RE.exec(event);
  if (m) return { ts, kind: "tool", who: m[1]!.toLowerCase(), what: m[2]! };
  return { ts, kind: "note", who: "-", what: event };
}

/** Parse the full activity timeline out of raw events.jsonl text. Pure. */
export function parseActivity(jsonl: string): ActivityItem[] {
  return parseTrace(jsonl).map((l) => toItem(l.ts, l.event));
}

export type ActivityFilter = {
  who?: string;
  kind?: ActivityKind;
  /** Gate risk or resolution matches (e.g. "ask", "blocked", "denied"). */
  risk?: string;
  /** Case-insensitive substring over who + what. */
  contains?: string;
  /** Epoch seconds cutoff (inclusive). */
  sinceTs?: number;
};

type Predicate = (i: ActivityItem) => boolean;

/** Compile the present filter conditions into predicates. Pure. */
function compileFilter(f: ActivityFilter): Predicate[] {
  const preds: Predicate[] = [];
  if (f.who) preds.push((i) => i.who === f.who!.toLowerCase());
  if (f.kind) preds.push((i) => i.kind === f.kind);
  if (f.risk) preds.push((i) => i.risk === f.risk || i.resolution === f.risk);
  if (f.sinceTs !== undefined) preds.push((i) => i.ts >= f.sinceTs!);
  const needle = f.contains?.toLowerCase();
  if (needle) preds.push((i) => `${i.who} ${i.what}`.toLowerCase().includes(needle));
  return preds;
}

/** Apply a filter (all present conditions must hold). Pure. */
export function filterActivity(items: ActivityItem[], f: ActivityFilter): ActivityItem[] {
  const preds = compileFilter(f);
  return items.filter((i) => preds.every((p) => p(i)));
}

/** Parse "30m" / "2h" / "3d" into epoch-seconds cutoff relative to now. Pure. */
export function parseSince(spec: string, nowMs: number): number | undefined {
  const m = /^(\d+)([mhd])$/.exec(spec.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unitSec = m[2] === "m" ? 60 : m[2] === "h" ? 3600 : 86400;
  return Math.floor(nowMs / 1000) - n * unitSec;
}

const GLYPHS: Record<string, string> = {
  allow: "·",
  "accept-edits-auto": "·",
  "delegated-auto": "·",
  approved: "✓",
  blocked: "✗",
  denied: "✗",
  "kernel-unreachable": "⚠",
};

function line(i: ActivityItem): string {
  const when = new Date(i.ts * 1000).toISOString().slice(5, 16).replace("T", " ");
  if (i.kind === "gate") {
    const glyph = GLYPHS[i.resolution ?? ""] ?? "·";
    return `  ${when} ${glyph} ${i.who} [${i.risk}→${i.resolution}] ${i.what.slice(0, 90)}`;
  }
  return `  ${when} ${i.kind === "tool" ? "→" : " "} ${i.who} ${i.what.slice(0, 90)}`;
}

/** Newest-last human timeline, capped at `limit` (default 40). Pure. */
export function formatActivity(items: ActivityItem[], limit = 40): string {
  if (!items.length) return "  (no matching activity)";
  const shown = items.slice(-limit);
  const head = items.length > shown.length ? `  … ${items.length - shown.length} earlier matching event(s) hidden (raise with --limit)\n` : "";
  return head + shown.map(line).join("\n");
}
