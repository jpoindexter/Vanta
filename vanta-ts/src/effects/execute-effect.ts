import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  persistHostEffectTransition,
  type EffectTransition,
  type HostEffectOutcome,
  type HostEffectReceipt,
} from "../agent/effect-persistence.js";

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

type EffectClaim = {
  version: 1;
  id: string;
  payloadSha256: string;
  idempotencyKey: string;
  state: "pending" | "started" | "settled";
  outcome?: HostEffectOutcome;
  updatedAt: string;
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

function claimFile(context: EffectGateContext, intent: EffectIntent): string {
  const key = payloadSha256(`${intent.id}\0${intent.idempotencyKey}`);
  return join(context.projectRoot, ".vanta", "effect-claims", `${key}.json`);
}

async function durableWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code ?? "")) throw error;
  } finally {
    await handle?.close();
  }
}

function assertClaimIdentity(existing: EffectClaim, intent: EffectIntent): void {
  if (
    existing.version !== 1
    || existing.id !== intent.id
    || existing.payloadSha256 !== intent.payloadSha256
    || existing.idempotencyKey !== intent.idempotencyKey
  ) {
    throw new Error("effect claim identity mismatch");
  }
}

async function readClaim(context: EffectGateContext, intent: EffectIntent): Promise<EffectClaim | null> {
  try {
    const existing = JSON.parse(await readFile(claimFile(context, intent), "utf8")) as EffectClaim;
    assertClaimIdentity(existing, intent);
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function claimIntent(context: EffectGateContext, intent: EffectIntent): Promise<{ created: boolean; claim: EffectClaim }> {
  const path = claimFile(context, intent);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const claim: EffectClaim = {
    version: 1,
    id: intent.id,
    payloadSha256: intent.payloadSha256,
    idempotencyKey: intent.idempotencyKey,
    state: "pending",
    updatedAt: new Date().toISOString(),
  };
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(claim)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    await syncDirectory(dirname(path));
    return { created: true, claim };
  } catch (error) {
    await handle?.close().catch(() => {});
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8")) as EffectClaim;
    assertClaimIdentity(existing, intent);
    return { created: false, claim: existing };
  }
}

async function updateClaim(
  context: EffectGateContext,
  intent: EffectIntent,
  state: EffectClaim["state"],
  outcome?: HostEffectOutcome,
): Promise<void> {
  await durableWrite(claimFile(context, intent), {
    version: 1,
    id: intent.id,
    payloadSha256: intent.payloadSha256,
    idempotencyKey: intent.idempotencyKey,
    state,
    ...(outcome ? { outcome } : {}),
    updatedAt: new Date().toISOString(),
  } satisfies EffectClaim);
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
  await updateClaim(context, intent, "settled", outcome.outcome);
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
  deps: { persistence?: EffectPersistence } = {},
): Promise<EffectExecutionResult<T>> {
  validateIntent(intent);
  const persistence = deps.persistence ?? effectPersistence;
  const existing = await readClaim(context, intent);
  if (existing) {
    if (existing.state === "settled" && existing.outcome) return { outcome: existing.outcome };
    return settle(context, intent, persistence, { outcome: "unknown" });
  }

  // Journal creation is the first executable gate. Failure throws before the
  // claim or provider operation, so an unrecordable effect cannot occur.
  await persistence.persist(context, intent, "pending");
  const claimed = await claimIntent(context, intent);
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
    const approved = context.approval
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
    if (!approved) return settle(context, intent, persistence, { outcome: "denied" });
  }

  await persistence.persist(context, intent, "started");
  await updateClaim(context, intent, "started");
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
