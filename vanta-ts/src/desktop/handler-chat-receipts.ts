import type { Conversation } from "../agent.js";
import { classifyProviderError } from "../providers/error-taxonomy.js";
import type { DesktopRunFailureKind,DesktopRunReceipt } from "../types.js";
import { type DesktopEvent } from "./handler-state.js";

export function interrupted(error: unknown, controller: AbortController): boolean {
  return controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

export function classifyDesktopFailure(error: unknown, wasInterrupted: boolean, events: DesktopEvent[]): DesktopRunFailureKind {
  if (wasInterrupted) return "interrupted";
  // Auth is decided by the SHARED, priority-ordered taxonomy rather than a local
  // regex — two independent classifiers for the same 401 drifted apart once and
  // would again. The string banks below still cover the desktop-only kinds, and
  // the auth pattern stays as a fallback for failures carried only by event text.
  const reason = classifyProviderError(error).reason;
  if (reason === "auth" || reason === "auth_permanent") return "provider_auth";
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)} ${events.map((event) => event.label).join(" ")}`.toLowerCase();
  if (/\b401\b|incorrect api key|invalid api key|authentication|unauthorized|oauth|credential|token (?:expired|revoked|refresh)|login required|not authorized/.test(text)) return "provider_auth";
  if (/setup|api key|provider is required|no provider|configure/.test(text)) return "setup";
  if (/denied|rejected|not approved|approval/.test(text)) return "user_denied";
  if (/tool|shell_cmd|web_fetch|file_|execute/.test(text)) return "tool";
  if (/model|provider|rate limit|quota|timeout|network|fetch|offline|abort/.test(text)) return "model";
  return "unknown";
}

export function recoveryActions(status: DesktopRunReceipt["status"]): DesktopRunReceipt["actions"] {
  return status === "done" ? [] : ["retry_failed_step", "edit_request", "start_from_checkpoint"];
}

export function receiptStatusForStoppedReason(stoppedReason: string): Pick<DesktopRunReceipt, "status" | "failureKind"> {
  if (stoppedReason === "done") return { status: "done" };
  if (stoppedReason === "interrupted") return { status: "interrupted", failureKind: "interrupted" };
  return { status: "failed", failureKind: "unknown" };
}

export function queuedTurnFailureReason(stoppedReason: string): string {
  if (stoppedReason === "repeated_failure") return "Task stopped after repeated failures.";
  if (stoppedReason === "max_iterations") return "Task stopped at the iteration safety limit.";
  if (stoppedReason === "tool_budget") return "Task stopped at the tool-call safety limit.";
  if (stoppedReason === "context_length") return "Task stopped because the context limit was reached.";
  if (stoppedReason === "interrupted") return "Task stopped by the operator.";
  return "Task stopped before completion.";
}

export function queuedTurnExceptionReason(failureKind: DesktopRunFailureKind, wasInterrupted: boolean): string {
  if (wasInterrupted) return "Task stopped by the operator.";
  if (failureKind === "provider_auth") return "Provider authentication is required.";
  if (failureKind === "user_denied") return "A required action was denied.";
  if (failureKind === "tool") return "A required tool failed.";
  if (failureKind === "model") return "The model or provider failed.";
  if (failureKind === "setup") return "Vanta setup is incomplete.";
  return "Task failed before completion.";
}

export function buildRunReceipt(opts: {
  status: DesktopRunReceipt["status"];
  events: DesktopEvent[];
  instruction: string;
  partialText?: string;
  failureKind?: DesktopRunFailureKind;
}): DesktopRunReceipt {
  return {
    status: opts.status,
    ...(opts.failureKind ? { failureKind: opts.failureKind } : {}),
    events: opts.events.map((event) => ({ ...event })),
    actions: recoveryActions(opts.status),
    checkpoint: opts.status === "done" ? undefined : { instruction: opts.instruction, ...(opts.partialText ? { partialText: opts.partialText } : {}) },
  };
}

export function attachDesktopRunReceipt(convo: Conversation, receipt: DesktopRunReceipt, finalText: string): void {
  const last = convo.messages.at(-1);
  if (last?.role === "assistant") last.desktopRun = receipt;
  else convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
}
