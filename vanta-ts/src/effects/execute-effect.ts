import { createHash } from "node:crypto";
import {
  persistHostEffectTransition,
  type EffectTransition,
  type HostEffectOutcome,
  type HostEffectReceipt,
} from "../agent/effect-persistence.js";
import { claimEffectIntent, readEffectClaim, updateEffectClaim } from "./effect-claim.js";
import { effectApprovalPersistence, type EffectApprovalPersistence } from "./effect-approval.js";

export type EffectIntent = {
  id: string;
  actor: string;
  host: string;
  kind: string;
  action: string;
  targetClass: string;
  payloadSha256: string;
  idempotencyKey: string;
};

export type EffectApprovalRequest = {
  action: string;
  reason: string;
  intentId: string;
  effectKind: string;
  targetClass: string;
  payloadSha256: string;
  idempotencyKey: string;
};

export type EffectGateContext = {
  kernel: { assess(action: string): Promise<{ risk: "allow" | "ask" | "block"; reason?: string }> };
  approval?: { request(request: EffectApprovalRequest): Promise<boolean> };
  projectRoot: string;
  sessionId?: string;
  /** Stable host operation id, such as the provider tool-call id. */
  operationId?: string;
  permissionMode: string;
};

export type EffectOutcome = {
  outcome: HostEffectOutcome;
  acknowledgementId?: string;
  readbackSha256?: string;
  errorSha256?: string;
};

export type EffectOperationResult<T> = {
  value?: T;
  acknowledgementId?: string;
  readbackSha256?: string;
  verified?: boolean;
  /** The operation returned a definitive provider/local failure. */
  failed?: boolean;
};

export type EffectExecutionResult<T> = EffectOutcome & {
  value?: T;
  /**
   * Transient in-memory cause for a caller that must distinguish a recoverable
   * provider condition (for example MCP OAuth). It is never persisted.
   */
  operationError?: unknown;
};

export type EffectPersistence = {
  persist(
    context: EffectGateContext,
    intent: EffectIntent,
    transition: EffectTransition,
    outcome?: EffectOutcome,
  ): Promise<void>;
};

export const effectPersistence: EffectPersistence = {
  persist: (context, intent, transition, outcome) => persistHostEffectTransition(
    context.projectRoot,
    context.sessionId,
    {
      id: intent.id,
      actor: intent.actor,
      host: intent.host,
      kind: intent.kind,
      targetClass: intent.targetClass,
      payloadSha256: intent.payloadSha256,
      idempotencyKey: intent.idempotencyKey,
    },
    transition,
    outcome,
  ),
};

export function payloadSha256(payload: string | Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function stableEffectId(input: Pick<EffectIntent, "host" | "kind" | "targetClass" | "payloadSha256" | "idempotencyKey">): string {
  return createHash("sha256")
    .update([input.host, input.kind, input.targetClass, input.payloadSha256, input.idempotencyKey].join("\0"))
    .digest("hex");
}

function validateIntent(intent: EffectIntent): void {
  for (const [key, value] of Object.entries(intent)) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`effect intent ${key} is required`);
  }
  if (!/^[a-f0-9]{64}$/.test(intent.payloadSha256)) throw new Error("effect intent payloadSha256 must be SHA-256");
  if (intent.action.length > 1_000) throw new Error("effect intent action is too long");
}

function safeAcknowledgement(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[\r\n]/g, "").slice(0, 256);
}

async function settle<T>(
  context: EffectGateContext,
  intent: EffectIntent,
  persistence: EffectPersistence,
  outcome: EffectOutcome,
  value?: T,
): Promise<EffectExecutionResult<T>> {
  await persistence.persist(context, intent, "settled", outcome);
  await updateEffectClaim(context, intent, "settled", outcome.outcome);
  return { ...outcome, ...(value === undefined ? {} : { value }) };
}

/**
 * Execute one consequential effect with durable preflight, kernel assessment,
 * exact approval, at-most-once claiming, and truthful settlement. It never
 * retries the supplied operation.
 */
export async function executeEffect<T>(
  intent: EffectIntent,
  context: EffectGateContext,
  operation: () => Promise<EffectOperationResult<T>>,
  deps: {
    persistence?: EffectPersistence;
    approvalPersistence?: EffectApprovalPersistence;
  } = {},
): Promise<EffectExecutionResult<T>> {
  validateIntent(intent);
  const persistence = deps.persistence ?? effectPersistence;
  const approvals = deps.approvalPersistence ?? effectApprovalPersistence;
  const existing = await readEffectClaim(context, intent);
  if (existing) {
    if (existing.state === "settled" && existing.outcome) return { outcome: existing.outcome };
    return settle(context, intent, persistence, { outcome: "unknown" });
  }

  // Journal creation is the first executable gate. Failure throws before the
  // claim or provider operation, so an unrecordable effect cannot occur.
  await persistence.persist(context, intent, "pending");
  const claimed = await claimEffectIntent(context, intent);
  if (!claimed.created) {
    return settle(context, intent, persistence, {
      outcome: claimed.claim.state === "settled" && claimed.claim.outcome
        ? claimed.claim.outcome
        : "unknown",
    });
  }

  let verdict: Awaited<ReturnType<EffectGateContext["kernel"]["assess"]>>;
  try {
    verdict = await context.kernel.assess(intent.action);
  } catch (error) {
    return settle(context, intent, persistence, {
      outcome: "blocked",
      errorSha256: payloadSha256(error instanceof Error ? error.message : String(error)),
    });
  }
  if (verdict.risk === "block") {
    return settle(context, intent, persistence, { outcome: "blocked" });
  }
  if (verdict.risk === "ask") {
    await approvals.persist(context, intent, "requested");
    let approved = false;
    try {
      approved = context.approval
        ? await context.approval.request({
            action: intent.action,
            reason: verdict.reason ?? "kernel approval required",
            intentId: intent.id,
            effectKind: intent.kind,
            targetClass: intent.targetClass,
            payloadSha256: intent.payloadSha256,
            idempotencyKey: intent.idempotencyKey,
          })
        : false;
    } catch (error) {
      await approvals.persist(context, intent, "expired");
      await approvals.settleExpired(context, intent);
      await updateEffectClaim(context, intent, "settled", "denied");
      return {
        outcome: "denied",
        errorSha256: payloadSha256(error instanceof Error ? error.message : String(error)),
      };
    }
    await approvals.persist(context, intent, approved ? "approved" : "denied");
    if (!approved) return settle(context, intent, persistence, { outcome: "denied" });
  }

  await persistence.persist(context, intent, "started");
  await updateEffectClaim(context, intent, "started");
  try {
    const result = await operation();
    const acknowledgementId = safeAcknowledgement(result.acknowledgementId);
    const outcome: EffectOutcome = {
      outcome: result.failed ? "failed" : result.verified ? "verified" : "confirmed",
      ...(acknowledgementId ? { acknowledgementId } : {}),
      ...(result.readbackSha256 ? { readbackSha256: result.readbackSha256 } : {}),
    };
    return settle(context, intent, persistence, outcome, result.value);
  } catch (error) {
    const settled = await settle<T>(context, intent, persistence, {
      outcome: "unknown",
      errorSha256: payloadSha256(error instanceof Error ? error.message : String(error)),
    });
    return { ...settled, operationError: error };
  }
}
