import type { Approval, DesktopRunReceipt } from "./types.js";

export type TaskDossierState = {
  status: "ready" | "working" | "approval" | "attention" | "review";
  statusLabel: string;
  outcome: string;
  nextAction: string;
};

export function taskDossierState(props: {
  title: string;
  hasMessages: boolean;
  busy: boolean;
  streaming: boolean;
  approval: Approval | null;
  recovery: DesktopRunReceipt | null;
  queueCount: number;
}): TaskDossierState {
  const outcome = props.title === "New session" ? "Name the outcome you want Vanta to deliver." : props.title;
  if (props.approval) return { status: "approval", statusLabel: "Approval needed", outcome, nextAction: "Review the exact action, then allow it once or reject it." };
  if (props.recovery) {
    const reconnect = props.recovery.failureKind === "provider_auth";
    return { status: "attention", statusLabel: "Needs attention", outcome, nextAction: reconnect ? "Reconnect the selected model to resume the saved request." : "Choose one of the saved recovery actions below." };
  }
  if (props.busy || props.streaming) {
    return { status: "working", statusLabel: "In progress", outcome, nextAction: workingNextAction(props.queueCount) };
  }
  if (!props.hasMessages) return { status: "ready", statusLabel: "Ready to start", outcome, nextAction: "Describe the outcome in the composer below." };
  return { status: "review", statusLabel: "Ready for review", outcome, nextAction: reviewNextAction(props.queueCount) };
}

function workingNextAction(queueCount: number): string {
  if (!queueCount) return "Vanta is working. You can queue the next message without interrupting it.";
  const subject = queueCount === 1 ? "message is" : "messages are";
  return `Vanta is working. ${queueCount} ${subject} queued.`;
}

function reviewNextAction(queueCount: number): string {
  if (!queueCount) return "Review the result or ask for the next step.";
  const verb = queueCount === 1 ? "message starts" : "messages start";
  return `Review the result or ask for the next step. ${queueCount} queued ${verb} next.`;
}

export function TaskDossier(props: Parameters<typeof taskDossierState>[0]) {
  const state = taskDossierState(props);
  return <section className={`task-dossier state-${state.status}`} aria-label="Current task" aria-live="polite">
    <div className="task-dossier-outcome"><span>Outcome</span><strong>{state.outcome}</strong></div>
    <div className="task-dossier-next"><span>{state.statusLabel}</span><strong>{state.nextAction}</strong></div>
  </section>;
}
