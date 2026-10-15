export type TraceEvidence = {
  label: string;
  ok?: boolean;
  kind?: "tool_start" | "tool_end" | "note" | "summary";
  name?: string;
  detail?: string;
};

export type TraceGroup = {
  label: string;
  status: "active" | "done" | "attention";
  evidence: TraceEvidence[];
};

const READ_TOOLS = /^(read|grep|glob|find|list|search|web_search|web_fetch|fetch)/i;

function readLike(event: TraceEvidence): boolean {
  return READ_TOOLS.test(event.name ?? event.label.replace(/^[^a-z0-9]+/i, ""));
}

function withoutCompletedStarts(events: readonly TraceEvidence[]): TraceEvidence[] {
  const completed = new Set(events.filter((event) => event.kind === "tool_end" && event.name).map((event) => event.name));
  return events.filter((event) => !(event.kind === "tool_start" && event.name && completed.has(event.name)));
}

function statusOf(event: TraceEvidence): TraceGroup["status"] {
  if (event.ok === false) return "attention";
  return event.kind === "tool_start" || event.ok === undefined ? "active" : "done";
}

/**
 * Collapse a RUN of consecutive successful calls to the same tool into one row
 * with a count — six `edit_file` lines say no more than "edit_file ×6" and cost
 * six times the vertical space. Only consecutive events merge, so a repeat later
 * in the turn still reads as a separate step, and a failure never merges into a
 * success run: `attention` has to stay individually visible.
 */
function coalesce(events: readonly TraceEvidence[]): TraceGroup[] {
  const groups: TraceGroup[] = [];
  for (const event of events) {
    const status = statusOf(event);
    const prev = groups.at(-1);
    const head = prev?.evidence[0];
    const mergeable = prev && head && status === "done" && prev.status === "done" && Boolean(head.name) && head.name === event.name;
    if (!mergeable) {
      groups.push({ label: event.label, status, evidence: [event] });
      continue;
    }
    prev.evidence.push(event);
    prev.label = `${head.label} ×${prev.evidence.length}`;
  }
  return groups;
}

export function compactTrace(events: readonly TraceEvidence[]): TraceGroup[] {
  const visible = withoutCompletedStarts(events).filter((event) => event.kind !== "note");
  const reads = visible.filter((event) => event.kind === "tool_end" && event.ok !== false && readLike(event));
  const rest = visible.filter((event) => !reads.includes(event));
  const groups: TraceGroup[] = [];

  if (reads.length) {
    const tools = new Set(reads.map((event) => event.name).filter(Boolean));
    groups.push({
      label: reads.length === 1 ? reads[0]!.label : `Read and searched ${reads.length} times across ${tools.size || 1} tool${tools.size === 1 ? "" : "s"}`,
      status: "done",
      evidence: reads,
    });
  }

  groups.push(...coalesce(rest));

  const active = groups.filter((group) => group.status === "active");
  if (active.length > 1) {
    const keep = active.at(-1)!;
    return groups.filter((group) => group.status !== "active" || group === keep);
  }
  return groups;
}
