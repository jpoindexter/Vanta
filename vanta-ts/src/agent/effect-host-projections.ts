import { ReceiptSchema, RunSchema, WorkItemSchema, type WorkItemState } from "../work-items/contract.js";
import type { EffectTransition, HostEffectOutcome, HostEffectRecord, HostEffectReceipt } from "./effect-persistence.js";
import type { Projection } from "./effect-journal.js";

type HostInput = { sessionId?: string; effect: HostEffectRecord; transition: EffectTransition; receipt?: HostEffectReceipt; at: string };
type HostContext = HostInput & { stableSession: string; workItemId: string; state: WorkItemState };

export function hostProjections(input: HostInput): Projection[] {
  const stableSession = input.sessionId ?? "one-shot";
  const context = { ...input, stableSession, workItemId: `${stableSession}:effect:${input.effect.id}`, state: hostEffectState(input.transition, input.receipt?.outcome) };
  const projections: Projection[] = [
    { file: "tool-effects.jsonl", line: JSON.stringify(hostRecord(context)) },
    { file: "work-items.jsonl", line: JSON.stringify(hostItem(context)) },
    { file: "runs.jsonl", line: JSON.stringify(hostRun(context)) },
  ];
  if (input.transition === "settled" && input.receipt) {
    projections.push({ file: "action-receipts.jsonl", line: JSON.stringify(hostReceipt({ ...context, receipt: input.receipt })) });
  }
  return projections;
}

function hostRecord(input: HostContext) {
  const { at, stableSession, effect, transition, receipt } = input;
  return {
    at,
    sessionId: stableSession,
    effectId: effect.id,
    actor: effect.actor,
    host: effect.host,
    kind: effect.kind,
    targetClass: effect.targetClass,
    payloadSha256: effect.payloadSha256,
    idempotencyKey: effect.idempotencyKey,
    transition,
    ...(receipt ? {
      outcome: receipt.outcome,
      ...(receipt.acknowledgementId ? { acknowledgementId: receipt.acknowledgementId } : {}),
      ...(receipt.readbackSha256 ? { readbackSha256: receipt.readbackSha256 } : {}),
      ...(receipt.errorSha256 ? { errorSha256: receipt.errorSha256 } : {}),
    } : {}),
  };
}

function hostItem(input: HostContext) {
  const { at, workItemId, state, effect } = input;
  return WorkItemSchema.parse({
    version: 1,
    id: workItemId,
    outcome: `Execute ${effect.kind}`,
    source: "effect-intent",
    state,
    runId: workItemId,
    ...(state === "needs human" ? {
      waitCondition: "External effect settlement is uncertain",
      nextAction: "Request human readback before retrying",
      resumeContext: `Resolve effect ${effect.id} without replaying it`,
    } : {}),
    updatedAt: at,
  });
}

function hostRun(input: HostContext) {
  const { at, workItemId, state, effect, transition } = input;
  return RunSchema.parse({
    version: 1,
    id: workItemId,
    workItemId,
    state,
    actor: `${effect.host}:${effect.actor}`,
    ...(transition !== "pending" ? { startedAt: at } : {}),
    ...(transition === "settled" ? { settledAt: at } : {}),
  });
}

function hostReceipt(input: HostContext & { receipt: HostEffectReceipt }) {
  const { workItemId, at, effect, receipt } = input;
  const disposition = hostEffectDisposition(receipt.outcome);
  const verification = receipt.outcome === "verified"
    ? "verified" as const
    : receipt.outcome === "confirmed" || receipt.outcome === "unknown"
      ? "unverified" as const
      : undefined;
  const evidence = receipt.readbackSha256 ?? receipt.acknowledgementId;
  return ReceiptSchema.parse({
    version: 1,
    id: `${workItemId}:${at}`,
    workItemId,
    runId: workItemId,
    action: effect.kind,
    disposition,
    ...(verification ? { verification } : {}),
    ...(evidence ? { evidence } : {}),
    at,
  });
}

function hostEffectState(transition: EffectTransition, outcome?: HostEffectOutcome): WorkItemState {
  if (transition === "pending") return "queued";
  if (transition === "started") return "running";
  if (outcome === "verified") return "verified";
  if (outcome === "confirmed") return "unverified";
  if (outcome === "unknown") return "needs human";
  if (outcome === "denied" || outcome === "blocked") return "stopped";
  return "failed";
}

function hostEffectDisposition(outcome: HostEffectOutcome) {
  if (outcome === "denied" || outcome === "blocked") return "denied" as const;
  if (outcome === "unknown") return "unknown" as const;
  if (outcome === "confirmed" || outcome === "verified") return "confirmed" as const;
  return "none" as const;
}
