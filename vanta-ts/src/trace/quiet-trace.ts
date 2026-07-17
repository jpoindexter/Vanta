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

  for (const event of rest) {
    groups.push({
      label: event.label,
      status: event.ok === false ? "attention" : event.kind === "tool_start" || event.ok === undefined ? "active" : "done",
      evidence: [event],
    });
  }

  const active = groups.filter((group) => group.status === "active");
  if (active.length > 1) {
    const keep = active.at(-1)!;
    return groups.filter((group) => group.status !== "active" || group === keep);
  }
  return groups;
}
