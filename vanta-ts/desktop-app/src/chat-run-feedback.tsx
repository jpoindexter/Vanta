import { Plug,RotateCcw,ShieldCheck } from "lucide-react";
import { ApprovalDecisionControls } from "./approval-decision-controls.js";
import { summarizeApproval } from "./approval-summary.js";
import { SchemaTraceExplorer,schemaRetryReady } from "./schema-trace-explorer.js";
import type { Approval,ApprovalDecision,DesktopRunReceipt,PermissionSection } from "./types.js";
export { ToolActivity as RunTimeline } from "./librechat/tool-activity.js";
export { RunActivity as EventTimeline } from "./librechat/run-activity.js";

type RecoveryProps = { receipt: DesktopRunReceipt; onRetry: () => void; onReconnect: () => void; onEdit: () => void; onCheckpoint: () => void };

export function RunRecovery(props: RecoveryProps) {
  const providerAuth = props.receipt.failureKind === "provider_auth";
  const label = providerAuth ? "Provider authentication required" : props.receipt.status === "interrupted" ? "Run stopped" : "Run needs attention";
  const reason = props.receipt.failureKind ? props.receipt.failureKind.replaceAll("_", " ") : "unknown";
  return (
    <section className="run-recovery" role="status">
      <div><strong>{label}</strong><span>{providerAuth ? "Your request is saved. Reconnect the selected model before Vanta resumes it." : `Partial output and timeline were saved. Failure: ${reason}.`}</span></div>
      {props.receipt.counterexample ? <div className="run-counterexample"><strong>{props.receipt.counterexample.path}</strong><span>Predicted {props.receipt.counterexample.predicted}; observed {props.receipt.counterexample.observed}.</span><span>Safe next: {props.receipt.counterexample.safeNextAction}.</span></div> : null}
      {props.receipt.schemaTrace ? <SchemaTraceExplorer trace={props.receipt.schemaTrace} /> : null}
      <RecoveryActions {...props} />
    </section>
  );
}

export function checkpointPrompt(receipt: DesktopRunReceipt): string {
  const instruction = receipt.checkpoint?.instruction ?? "Continue from the saved checkpoint.";
  const partial = receipt.checkpoint?.partialText?.trim();
  return partial ? `Continue from this checkpoint and avoid repeating completed work. Original request: ${instruction}\n\nSaved partial output:\n${partial}` : `Continue from this checkpoint. Original request: ${instruction}`;
}

export function ApprovalCheckpoint(props: { approval: Approval; onAnswer: (decision: ApprovalDecision) => void | Promise<void> }) {
  const request = props.approval.request;
  const titleId = `approval-${props.approval.id}`;
  const summary = summarizeApproval(props.approval);

  return (
    <section className={`inline-approval approval-card ${request?.kind ?? "generic"}`} role="alert" aria-labelledby={titleId}>
      <header className="approval-card-head">
        <ShieldCheck size={16} aria-hidden="true" />
        <div>
          <strong id={titleId}><span className="sr-only">Approval required: </span>{summary.headline}</strong>
          {summary.lede ? <p>{summary.lede}</p> : null}
        </div>
      </header>
      {summary.preview ? <figure className="approval-card-preview"><figcaption>{summary.preview.label}</figcaption><pre><code>{summary.preview.text}</code></pre></figure> : null}
      {summary.details.length ? <details className="approval-card-details"><summary>Details</summary>{summary.details.map((section) => <ApprovalSection key={section.label} section={section} />)}</details> : null}
      <ApprovalDecisionControls key={props.approval.id} approval={props.approval} onAnswer={props.onAnswer} />
    </section>
  );
}

function ApprovalSection({ section }: { section: PermissionSection }) {
  return <div className={`approval-section ${section.tone ?? ""}`}><strong>{section.label}</strong><code>{section.value}</code></div>;
}

export function EmptyState(props: { onPrompt: (text: string) => void }) {
  const prompts = ["Show me what changed in this project", "Find the highest-impact task", "Review the current roadmap"];
  return (
    <div className="empty-state">
      <p className="empty-kicker">Vanta is ready in this project</p>
      <h2>Name the outcome.</h2>
      <p>Vanta will show its context, actions, approvals, and proof as it works.</p>
      <div className="prompt-grid">{prompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => props.onPrompt(prompt)}><span aria-hidden="true">0{index + 1}</span><strong>{prompt}</strong></button>)}</div>
    </div>
  );
}

function RecoveryActions(props: RecoveryProps) {
  const providerAuth = props.receipt.failureKind === "provider_auth";
  const hasRetryAction = props.receipt.actions.includes("retry_failed_step");
  const retryReady = hasRetryAction && schemaRetryReady(props.receipt.schemaTrace);
  const showRetry = hasRetryAction || Boolean(props.receipt.schemaTrace);
  return (
      <div className="run-recovery-actions">
        {providerAuth ? <button type="button" onClick={props.onReconnect}><Plug size={15} />Reconnect model</button> : null}
        {showRetry ? <button type="button" disabled={!retryReady} title={!retryReady && props.receipt.schemaTrace ? "Recertify the Schema model before retrying" : undefined} onClick={props.onRetry}><RotateCcw size={15} />Retry failed step</button> : null}
        {props.receipt.actions.includes("edit_request") ? <button type="button" onClick={props.onEdit}>Edit request</button> : null}
        {props.receipt.actions.includes("start_from_checkpoint") ? <button type="button" onClick={props.onCheckpoint}>Start from checkpoint</button> : null}
      </div>
  );
}
