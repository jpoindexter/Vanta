import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EffectGateContext, EffectIntent } from "./execute-effect.js";
import type { HostEffectOutcome } from "../agent/effect-persistence.js";

export type EffectClaim = {
  version: 1;
  id: string;
  payloadSha256: string;
  idempotencyKey: string;
  state: "pending" | "started" | "settled";
  outcome?: HostEffectOutcome;
  updatedAt: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function claimFile(context: EffectGateContext, intent: EffectIntent): string {
  const key = sha256(`${intent.id}\0${intent.idempotencyKey}`);
  return join(context.projectRoot, ".vanta", "effect-claims", `${key}.json`);
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

export async function readEffectClaim(
  context: EffectGateContext,
  intent: EffectIntent,
): Promise<EffectClaim | null> {
  try {
    const existing = JSON.parse(await readFile(claimFile(context, intent), "utf8")) as EffectClaim;
    assertClaimIdentity(existing, intent);
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function claimEffectIntent(
  context: EffectGateContext,
  intent: EffectIntent,
): Promise<{ created: boolean; claim: EffectClaim }> {
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

export function updateEffectClaim(
  context: EffectGateContext,
  intent: EffectIntent,
  state: EffectClaim["state"],
  outcome?: HostEffectOutcome,
): Promise<void> {
  return durableWrite(claimFile(context, intent), {
    version: 1,
    id: intent.id,
    payloadSha256: intent.payloadSha256,
    idempotencyKey: intent.idempotencyKey,
    state,
    ...(outcome ? { outcome } : {}),
    updatedAt: new Date().toISOString(),
  } satisfies EffectClaim);
}
