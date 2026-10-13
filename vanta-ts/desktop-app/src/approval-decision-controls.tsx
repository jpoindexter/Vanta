import { useRef, useState } from "react";
import type { Approval, ApprovalDecision } from "./types.js";
import { ConfirmationActions, ControlButton, InlineError } from "./form-controls.js";

type Props = { approval: Approval; onAnswer: (decision: ApprovalDecision) => void | Promise<void> };

function canRemember(approval: Approval): boolean {
  return Boolean(approval.toolName && approval.request?.canRemember && !approval.request?.fresh);
}

export function ApprovalDecisionControls({ approval, onAnswer }: Props) {
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const remember = canRemember(approval);
  async function answer(decision: ApprovalDecision) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(decision); setError("");
    try { await onAnswer(decision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm the approval result. Check activity before trying again."); }
    finally { inFlight.current = false; setPending(null); }
  }
  if (approval.error) return <>
    <InlineError>{approval.error}</InlineError>
    <ControlButton type="button" onClick={() => void answer("deny")}>Dismiss</ControlButton>
  </>;
  return <>
    {error ? <InlineError>{error}</InlineError> : null}
    <ConfirmationActions className="approval-actions">
      <ControlButton tone="primary" type="button" disabled={!!pending} aria-busy={pending === "allow"} onClick={() => void answer("allow")}>{pending === "allow" ? "Allowing…" : "Allow once"}</ControlButton>
      {remember ? <ControlButton type="button" disabled={!!pending} aria-busy={pending === "always"} onClick={() => void answer("always")}>{pending === "always" ? "Saving…" : "Always allow this tool"}</ControlButton> : null}
      <ControlButton type="button" disabled={!!pending} onClick={() => void answer("deny")}>Reject</ControlButton>
    </ConfirmationActions>
    {approval.request?.fresh ? <p className="approval-note">This exact action needs approval each time. Remembered tool rules do not replace it.</p> : null}
    {remember ? <p className="approval-note">Remembered choices apply to <code>{approval.toolName}</code> in this project, including future tasks. Kernel restrictions and one-time approvals still apply.</p> : null}
    {remember ? <details><summary>More permission options</summary><ControlButton type="button" disabled={!!pending} onClick={() => void answer("never")}>Never allow this tool</ControlButton></details> : null}
  </>;
}
