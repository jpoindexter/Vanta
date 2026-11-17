// LibreChat ToolCallGroup/ActivityPhaseGroup disclosure pattern adapted to
// Vanta's recorded trace. Upstream f10b1d91f1eee3a2c82d5247bf620351486b7c1b.
// Copyright (c) 2026 LibreChat. MIT; see ./LICENSE.
import { ChevronRight, ListChecks } from "lucide-react";
import { compactTrace, type TraceGroup } from "../../../src/trace/quiet-trace.js";
import type { EventRow } from "../types.js";

type DisplayGroup = Omit<TraceGroup, "status"> & { status: TraceGroup["status"] | "recorded" };

export function RunActivity({ events, running = false }: { events: EventRow[]; running?: boolean }) {
  // Legacy saved traces may lack a terminal event. An idle stream is not proof
  // of tool success, but it is proof that this UI must not claim ongoing work.
  const groups: DisplayGroup[] = compactTrace(events).map((group) =>
    !running && group.status === "active" ? { ...group, status: "recorded" } : group);
  const completed = groups.filter((group) => group.status === "done" || group.status === "recorded");
  const visible = groups.filter((group) => group.status === "active" || group.status === "attention");
  const count = completed.reduce((total, group) => total + group.evidence.length, 0);
  return <section className="lc-run-activity" aria-label="Current run activity">
    {completed.length ? <details className="lc-tool-group lc-completed-trace">
      <summary><ListChecks size={14} aria-hidden="true" /><span className="lc-activity-label">Activity</span><span className="lc-activity-meta">{count} recorded step{count === 1 ? "" : "s"}</span><ChevronRight className="lc-activity-chevron" size={14} aria-hidden="true" /></summary>
      <div className="lc-activity-rail"><TraceRows groups={completed} /></div>
    </details> : null}
    <TraceRows groups={visible} />
  </section>;
}

function TraceRows({ groups }: { groups: DisplayGroup[] }) {
  return <>{groups.map((group, index) => <details className="lc-trace-row" data-status={group.status}
    open={group.status === "attention" || undefined} key={`${group.label}-${index}`}>
    <summary><ChevronRight className="lc-activity-chevron" size={14} aria-hidden="true" /><span className="lc-activity-label">{group.label}</span><span className="lc-activity-meta">{statusLabel(group.status)}</span></summary>
    <div className="lc-activity-evidence" aria-label="Tool evidence">{group.evidence.map((event, evidenceIndex) => <pre key={evidenceIndex}>{event.detail || event.label}</pre>)}</div>
  </details>)}</>;
}

function statusLabel(status: DisplayGroup["status"]): string {
  return { attention: "Needs attention", recorded: "Outcome not recorded", active: "Running", done: "Recorded" }[status];
}
