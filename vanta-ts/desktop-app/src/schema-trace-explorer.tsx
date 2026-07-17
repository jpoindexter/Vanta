import { CheckCircle2, ChevronRight, CircleAlert, GitCompareArrows, RotateCcw } from "lucide-react";
import type { DesktopSchemaTrace, DesktopSchemaTransitionTrace } from "./types.js";

export function schemaRetryReady(trace: DesktopSchemaTrace | undefined): boolean {
  return !trace || (trace.certification.certified && trace.queue.status === "resumed");
}

export function SchemaTraceExplorer(props: { trace: DesktopSchemaTrace }) {
  const { trace } = props;
  const ready = schemaRetryReady(trace);
  return (
    <details className="schema-trace-explorer">
      <summary>
        <span><GitCompareArrows size={14} />Inspect Schema trace</span>
        <small>model v{trace.certification.modelVersion} · {trace.transitions.length} transition{trace.transitions.length === 1 ? "" : "s"}</small>
        <ChevronRight className="schema-trace-chevron" size={14} aria-hidden="true" />
      </summary>
      <div className="schema-trace-body">
        <header>
          <span className={`schema-trace-state ${ready ? "ready" : "stopped"}`}>
            {ready ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            {trace.queue.status}
          </span>
          <span>Plan {trace.planId}</span>
          <span>Run {trace.runId}</span>
        </header>
        <p>{trace.queue.reason ?? "Queue state was recorded with the run."}</p>
        <div className="schema-certification">
          <strong>{trace.certification.certified ? "Certified" : "Not certified"}</strong>
          <span>{trace.certification.coverage}</span>
        </div>
        <div className="schema-transition-list" aria-label="Schema transitions">
          {trace.transitions.map((transition) => <TransitionTrace key={transition.id} transition={transition} />)}
        </div>
        {!ready ? <p className="schema-retry-gate"><RotateCcw size={13} />Retry unlocks after complete-history recertification.</p> : null}
      </div>
    </details>
  );
}

function TransitionTrace(props: { transition: DesktopSchemaTransitionTrace }) {
  const { transition } = props;
  return (
    <details className="schema-transition" data-status={transition.status}>
      <summary>
        <span>{String(transition.sequence).padStart(2, "0")}</span>
        <strong>{transition.label}</strong>
        <small>{transition.actionMode} · {transition.status}</small>
        <ChevronRight size={13} aria-hidden="true" />
      </summary>
      <div className="schema-transition-detail">
        <dl>
          <div><dt>Model</dt><dd>v{transition.modelVersion}</dd></div>
          {transition.path ? <div><dt>Path</dt><dd>{transition.path}</dd></div> : null}
          <div><dt>Predicted</dt><dd>{transition.predicted}</dd></div>
          <div><dt>Observed</dt><dd>{transition.observed}</dd></div>
        </dl>
        {transition.modelDiff ? <section aria-label="Model diff">
          <h4>Model diff · v{transition.modelDiff.fromVersion} → v{transition.modelDiff.toVersion}</h4>
          <ul>{transition.modelDiff.summary.map((line) => <li key={line}>{line}</li>)}</ul>
        </section> : null}
        {transition.backtest ? <section aria-label="Backtest receipt">
          <h4>Backtest receipt</h4>
          <p>{transition.backtest.certified ? "Certified" : "Failed"} · {transition.backtest.matchedTransitions}/{transition.backtest.totalTransitions} transitions matched</p>
          <code>{transition.backtest.timelineHash}</code>
        </section> : null}
      </div>
    </details>
  );
}
