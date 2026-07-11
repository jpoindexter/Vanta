import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { classifyProviderError } from "../providers/error-taxonomy.js";
import { resolveVantaHome } from "../store/home.js";

const SourceSchema = z.enum(["env", "keychain", "bitwarden", "1password", "vault"]);
export type CredentialSource = z.infer<typeof SourceSchema>;
const CredentialSchema = z.object({
  provider: z.string().regex(/^[a-z0-9][a-z0-9-]+$/), id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  source: SourceSchema, ref: z.string().min(1), status: z.enum(["ready", "cooldown", "exhausted"]),
  cooldownUntil: z.string().datetime().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type CredentialRecord = z.infer<typeof CredentialSchema>;
type LeaseRecord = { leaseId: string; provider: string; credentialId: string; owner: string; expiresAt: string };
export type CredentialLease = { leaseId: string; id: string; source: CredentialSource; ref: string };
type State = { version: 1; credentials: CredentialRecord[]; leases: LeaseRecord[] };
export type AddCredentialInput = Pick<CredentialRecord, "provider" | "id" | "source" | "ref">;

const statePath = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), "credential-pools.json");
const auditPath = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), "credential-pool-audit.jsonl");
const lockPath = (env: NodeJS.ProcessEnv) => join(resolveVantaHome(env), ".credential-pools.lock");

async function loadState(env: NodeJS.ProcessEnv): Promise<State> {
  try {
    const raw = JSON.parse(await readFile(statePath(env), "utf8")) as State;
    const credentials = z.array(CredentialSchema).safeParse(raw.credentials);
    return credentials.success ? { version: 1, credentials: credentials.data, leases: raw.leases ?? [] } : emptyState();
  } catch { return emptyState(); }
}

const emptyState = (): State => ({ version: 1, credentials: [], leases: [] });

async function saveState(env: NodeJS.ProcessEnv, state: State): Promise<void> {
  const home = resolveVantaHome(env), path = statePath(env), temporary = `${path}.tmp`;
  await mkdir(home, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function withLock<T>(env: NodeJS.ProcessEnv, action: () => Promise<T>): Promise<T> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await mkdir(lockPath(env)); break; }
    catch { if (attempt === 49) throw new Error("credential pool is busy"); await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
  try { return await action(); }
  finally { await rm(lockPath(env), { recursive: true, force: true }); }
}

export async function listCredentials(env: NodeJS.ProcessEnv = process.env): Promise<CredentialRecord[]> {
  return (await loadState(env)).credentials;
}

export async function addCredential(input: AddCredentialInput, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<CredentialRecord> {
  return withLock(env, async () => {
    const state = await loadState(env);
    if (state.credentials.some((item) => item.provider === input.provider && item.id === input.id)) throw new Error(`credential ${input.provider}/${input.id} already exists`);
    const at = now.toISOString(), record = CredentialSchema.parse({ ...input, status: "ready", createdAt: at, updatedAt: at });
    state.credentials.push(record);
    await saveState(env, state);
    await audit(env, "add", record, at);
    return record;
  });
}

export async function removeCredential(provider: string, id: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return withLock(env, async () => {
    const state = await loadState(env), before = state.credentials.length;
    state.credentials = state.credentials.filter((item) => item.provider !== provider || item.id !== id);
    state.leases = state.leases.filter((item) => item.provider !== provider || item.credentialId !== id);
    if (state.credentials.length === before) return false;
    await saveState(env, state);
    await audit(env, "remove", { provider, id, source: "redacted", ref: "redacted" }, new Date().toISOString());
    return true;
  });
}

export async function leaseCredential(provider: string, owner: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<CredentialLease | null> {
  return withLock(env, async () => {
    const state = await loadState(env), nowMs = now.getTime();
    state.leases = state.leases.filter((item) => Date.parse(item.expiresAt) > nowMs);
    refreshCooldowns(state.credentials, nowMs);
    const leased = new Set(state.leases.map((item) => `${item.provider}/${item.credentialId}`));
    const record = state.credentials.find((item) => item.provider === provider && item.status === "ready" && !leased.has(`${provider}/${item.id}`));
    if (!record) { await saveState(env, state); return null; }
    const leaseId = randomUUID();
    state.leases.push({ leaseId, provider, credentialId: record.id, owner, expiresAt: new Date(nowMs + 120_000).toISOString() });
    await saveState(env, state);
    return { leaseId, id: record.id, source: record.source, ref: record.ref };
  });
}

function refreshCooldowns(records: CredentialRecord[], nowMs: number): void {
  for (const record of records) {
    if (record.status === "cooldown" && record.cooldownUntil && Date.parse(record.cooldownUntil) <= nowMs) {
      record.status = "ready";
      delete record.cooldownUntil;
    }
  }
}

export async function releaseCredential(leaseId: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await withLock(env, async () => {
    const state = await loadState(env);
    state.leases = state.leases.filter((item) => item.leaseId !== leaseId);
    await saveState(env, state);
  });
}

export async function markCredentialFailure(leaseId: string, error: unknown, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<void> {
  await withLock(env, async () => {
    const state = await loadState(env), lease = state.leases.find((item) => item.leaseId === leaseId);
    if (!lease) return;
    const record = state.credentials.find((item) => item.provider === lease.provider && item.id === lease.credentialId);
    if (!record) return;
    const verdict = classifyProviderError(error), at = now.toISOString();
    record.status = verdict.reason === "rate_limit" ? "cooldown" : "exhausted";
    record.updatedAt = at;
    if (record.status === "cooldown") record.cooldownUntil = new Date(now.getTime() + 60_000).toISOString();
    state.leases = state.leases.filter((item) => item.leaseId !== leaseId);
    await saveState(env, state);
    await audit(env, `failure:${verdict.reason}`, record, at);
  });
}

async function audit(env: NodeJS.ProcessEnv, action: string, record: { provider: string; id: string; source: string; ref: string }, at: string): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  const refHash = createHash("sha256").update(record.ref).digest("hex");
  await appendFile(auditPath(env), `${JSON.stringify({ action, provider: record.provider, id: record.id, source: record.source, refHash, at })}\n`, "utf8");
}
