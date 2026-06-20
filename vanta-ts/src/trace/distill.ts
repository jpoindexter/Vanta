// AHE-TRACE-DISTILLER — turns a run's `.vanta/events.jsonl` into a sourced
// root-cause report. Pure core: jsonl text → parsed lines → detected issues →
// overview.md + per-issue detail md, every claim citing the source trace
// line(s). The kernel writes each event as `{"ts":<secs>,"event":"<text>","h"}`.

export type TraceLine = { lineNo: number; ts: number; event: string };

export type Severity = "high" | "medium" | "low";

export type Issue = {
  title: string;
  severity: Severity;
  /** 1-based trace line numbers this claim is grounded in. */
  sourceLines: number[];
};

/** A single distilled report: a sourced overview + one detail body per issue. */
export type Distillation = { overview: string; details: string[] };

// Signal keywords that mark a likely failure/root-cause in an event line.
// Ordered most-severe-first so the first hit wins the line's classification.
const SIGNALS: ReadonlyArray<{ re: RegExp; label: string; severity: Severity }> = [
  { re: /\b(error|exception|panic|fatal)\b/i, label: "error", severity: "high" },
  { re: /\b(blocked|denied|forbidden|unauthor)/i, label: "blocked", severity: "high" },
  { re: /\b(fail(ed|ure)?|could not|cannot|unable to)\b/i, label: "failure", severity: "high" },
  { re: /\b(timeout|timed out|stall(ed)?|hung|deadlock)\b/i, label: "stall", severity: "medium" },
  { re: /\b(retry|retrying|retried|re-?attempt)\b/i, label: "retry", severity: "low" },
];

const LOOP_MIN = 3; // an identical event repeated this many times = a loop
const GAP_SECS = 300; // a quiet stretch this long between events = a long gap

// --- parse -----------------------------------------------------------------

const RawLine = (() => {
  // Tiny structural check without a zod dep in the hot parse path: we only need
  // `event` to be a string and `ts` a finite number; everything else tolerated.
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;
  return {
    parse(raw: string): { ts: number; event: string } | null {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!isRecord(json)) return null;
      const { ts, event } = json;
      if (typeof event !== "string") return null;
      return { ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0, event };
    },
  };
})();

/** Parse events.jsonl into trace lines, skipping malformed/blank lines.
 *  `lineNo` is the 1-based physical line in the file (stable for citations). */
export function parseTrace(jsonl: string): TraceLine[] {
  const out: TraceLine[] = [];
  const rows = jsonl.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.trim();
    if (!raw) continue;
    const parsed = RawLine.parse(raw);
    if (parsed) out.push({ lineNo: i + 1, ts: parsed.ts, event: parsed.event });
  }
  return out;
}

// --- detect ----------------------------------------------------------------

function detectSignals(lines: TraceLine[]): Issue[] {
  const byLabel = new Map<string, { severity: Severity; sourceLines: number[] }>();
  for (const line of lines) {
    const hit = SIGNALS.find((s) => s.re.test(line.event));
    if (!hit) continue;
    const bucket = byLabel.get(hit.label) ?? { severity: hit.severity, sourceLines: [] };
    bucket.sourceLines.push(line.lineNo);
    byLabel.set(hit.label, bucket);
  }
  return [...byLabel.entries()].map(([label, b]) => ({
    title: `${b.sourceLines.length} ${label} event${b.sourceLines.length > 1 ? "s" : ""}`,
    severity: b.severity,
    sourceLines: b.sourceLines,
  }));
}

function detectLoops(lines: TraceLine[]): Issue[] {
  const byEvent = new Map<string, number[]>();
  for (const line of lines) {
    const lns = byEvent.get(line.event) ?? [];
    lns.push(line.lineNo);
    byEvent.set(line.event, lns);
  }
  const out: Issue[] = [];
  for (const [event, lns] of byEvent) {
    if (lns.length < LOOP_MIN) continue;
    out.push({
      title: `Repeated event ×${lns.length} (loop): ${truncate(event, 60)}`,
      severity: "medium",
      sourceLines: lns,
    });
  }
  return out;
}

function detectGaps(lines: TraceLine[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (!prev || !cur || prev.ts <= 0 || cur.ts <= 0) continue;
    const gap = cur.ts - prev.ts;
    if (gap < GAP_SECS) continue;
    out.push({
      title: `Long gap of ${gap}s before this event`,
      severity: "low",
      sourceLines: [prev.lineNo, cur.lineNo],
    });
  }
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Heuristic root-cause detection over parsed trace lines. Each issue carries
 *  the citing line numbers. Sorted most-severe-first, then by first cited line. */
export function detectIssues(lines: TraceLine[]): Issue[] {
  const all = [...detectSignals(lines), ...detectLoops(lines), ...detectGaps(lines)];
  return all.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return sev !== 0 ? sev : (a.sourceLines[0] ?? 0) - (b.sourceLines[0] ?? 0);
  });
}

// --- render ----------------------------------------------------------------

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const SEVERITY_BADGE: Record<Severity, string> = {
  high: "🔴 high",
  medium: "🟠 medium",
  low: "🟡 low",
};

function cite(sourceLines: number[]): string {
  return sourceLines.map((n) => `L${n}`).join(", ");
}

/** Render the top-level overview.md: a one-line summary + a cited issue list. */
export function renderOverview(issues: Issue[]): string {
  if (issues.length === 0) {
    return "# Trace distillation\n\nNo issues detected — the trace is clean.\n";
  }
  const lines = ["# Trace distillation", "", `${issues.length} issue(s) detected.`, ""];
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (!issue) continue;
    lines.push(`${i + 1}. **${issue.title}** — ${SEVERITY_BADGE[issue.severity]} — cites ${cite(issue.sourceLines)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Render one issue's detail md: the claim + every cited source line quoted. */
export function renderDetail(issue: Issue, lines: TraceLine[]): string {
  const byNo = new Map(lines.map((l) => [l.lineNo, l]));
  const out = [
    `# ${issue.title}`,
    "",
    `Severity: ${SEVERITY_BADGE[issue.severity]}`,
    `Cited lines: ${cite(issue.sourceLines)}`,
    "",
    "## Source trace lines",
    "",
  ];
  for (const no of issue.sourceLines) {
    const line = byNo.get(no);
    out.push(line ? `- **L${no}**: \`${truncate(line.event, 200)}\`` : `- **L${no}**: (line not found)`);
  }
  return `${out.join("\n")}\n`;
}

/** Full pipeline: events.jsonl text → overview + one detail body per issue. */
export function distillTrace(jsonl: string): Distillation {
  const lines = parseTrace(jsonl);
  const issues = detectIssues(lines);
  return {
    overview: renderOverview(issues),
    details: issues.map((issue) => renderDetail(issue, lines)),
  };
}
