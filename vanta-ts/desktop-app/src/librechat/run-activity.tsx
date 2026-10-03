// LibreChat ToolCallGroup/ActivityPhaseGroup disclosure pattern adapted to
// Vanta's recorded trace. Upstream f10b1d91f1eee3a2c82d5247bf620351486b7c1b.
// Copyright (c) 2026 LibreChat. MIT; see ./LICENSE.
import { ChevronRight, ListChecks } from "lucide-react";
import { compactTrace, type TraceGroup } from "../../../src/trace/quiet-trace.js";
import type { EventRow } from "../types.js";

export function RunActivity({ events }: { events: EventRow[] }) {
  const groups = compactTrace(events);
  const completed = groups.filter((group) => group.status === "done");
  const visible = groups.filter((group) => group.status !== "done");
  const count = completed.reduce((total, group) => total + group.evidence.length, 0);
  return <section className="lc-run-activity" aria-label="Current run activity">
    {completed.length ? <details className="lc-tool-group lc-completed-trace">
      <summary><ListChecks size={14} aria-hidden="true" /><span className="lc-activity-label">Activity</span><span className="lc-activity-meta">{count} recorded step{count === 1 ? "" : "s"}</span><ChevronRight className="lc-activity-chevron" size={14} aria-hidden="true" /></summary>
      <div className="lc-activity-rail"><TraceRows groups={completed} /></div>
    </details> : null}
    <TraceRows groups={visible} />
  </section>;
}

function TraceRows({ groups }: { groups: TraceGroup[] }) {
  return <>{groups.map((group, index) => <details className="lc-trace-row" data-status={group.status}
    open={group.status === "attention" || undefined} key={`${group.label}-${index}`}>
    <summary><ChevronRight className="lc-activity-chevron" size={14} aria-hidden="true" /><span className="lc-activity-label">{group.label}</span><span className="lc-activity-meta">{group.status === "attention" ? "Needs attention" : group.status}</span></summary>
    <div className="lc-activity-evidence" aria-label="Tool evidence">{group.evidence.map((event, evidenceIndex) => <pre key={evidenceIndex}>{event.detail || event.label}</pre>)}</div>
  </details>)}</>;
}
