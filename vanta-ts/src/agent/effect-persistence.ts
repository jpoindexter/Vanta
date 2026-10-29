import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EffectDisposition, Message, ToolCall } from "../types.js";
import type { WorkItemState } from "../work-items/contract.js";
import { checkpointSessionMessages } from "../sessions/store.js";
import { withJournalLock } from "./effect-journal-lock.js";
import { buildEnvelope, commitEnvelope, reconcileEffectJournalUnlocked, type Projection } from "./effect-journal.js";
import { approvalProjections, toolProjections } from "./effect-tool-projections.js";
import { hostProjections } from "./effect-host-projections.js";
export { reconcileEffectJournal } from "./effect-journal.js";

export type EffectTransition = "pending" | "started" | "settled";
export type ApprovalTransition = "requested" | "approved" | "denied" | "expired";
export type HostEffectOutcome = "denied" | "blocked" | "confirmed" | "unknown" | "verified" | "failed";
export type HostEffectRecord = {
  id: string;
  actor: string;
  host: string;
  kind: string;
  targetClass: string;
  payloadSha256: string;
  idempotencyKey: string;
};
export type HostEffectReceipt = {
  outcome: HostEffectOutcome;
  acknowledgementId?: string;
  readbackSha256?: string;
  errorSha256?: string;
};

async function persistProjections(root: string, kind: "approval" | "effect", build: (at: string) => Projection[], ensureDirectory = false): Promise<void> {
  await withJournalLock(root, async () => {
    await reconcileEffectJournalUnlocked(root).catch(() => {});
    if (ensureDirectory) await mkdir(join(root, ".vanta"), { recursive: true, mode: 0o700 });
    const at = new Date().toISOString();
    await commitEnvelope(root, buildEnvelope(kind, at, build(at)));
  });
}

/** Compatibility boundary: persist only redacted metadata through the serialized journal. */
export async function persistApprovalTransition(
  root: string,
  sessionId: string | undefined,
  call: ToolCall,
  action: string,
  transition: ApprovalTransition,
): Promise<void> {
  if (!root) return;
  await persistProjections(root, "approval", at => approvalProjections({ sessionId, call, action, transition, at }), true);
}

export async function persistEffectTransition(
  root: string,
  sessionId: string | undefined,
  call: ToolCall,
  transition: EffectTransition,
  disposition?: EffectDisposition,
  settledState?: WorkItemState,
): Promise<void> {
  if (!root) return;
  await persistProjections(root, "effect", at => toolProjections({ sessionId, call, transition, disposition, settledState, at }), true);
}

export async function persistHostEffectTransition(
  root: string,
  sessionId: string | undefined,
  effect: HostEffectRecord,
  transition: EffectTransition,
  receipt?: HostEffectReceipt,
): Promise<void> {
  if (!root) throw new Error("effect journal requires a project root");
  await persistProjections(root, "effect", at => hostProjections({ sessionId, effect, transition, receipt, at }));
}

export async function checkpointToolTranscript(sessionId: string | undefined, messages: Message[]): Promise<void> {
  if (!sessionId) return;
  await checkpointSessionMessages(sessionId, messages).catch(() => {});
}
