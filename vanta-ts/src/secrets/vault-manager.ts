import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { bitwardenProvider, onePasswordProvider, type ExecFn } from "./provider.js";

const BackendSchema = z.enum(["bitwarden", "1password"]);
export type VaultBackend = z.infer<typeof BackendSchema>;

const RecordSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  backend: BackendSchema,
  ref: z.string().min(1),
  scopes: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});
export type VaultSecretRecord = z.infer<typeof RecordSchema>;

const StoreSchema = z.object({ version: z.literal(1), secrets: z.array(RecordSchema) });
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export type AddVaultSecretInput = {
  name: string; backend: VaultBackend; ref: string; scopes: string[];
  createdAt?: string; rotatedAt?: string; expiresAt?: string;
};

export function manifestPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(storageEnv(env)), "vault-secrets.json");
}

export function auditPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(storageEnv(env)), "vault-secret-audit.jsonl");
}

function storageEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env.VANTA_PROFILE_BASE_HOME ? { ...env, VANTA_HOME: env.VANTA_PROFILE_BASE_HOME } : env;
}

export async function listVaultSecrets(env: NodeJS.ProcessEnv = process.env): Promise<VaultSecretRecord[]> {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(await readFile(manifestPath(env), "utf8")));
    return parsed.success ? parsed.data.secrets : [];
  } catch { return []; }
}

export async function addVaultSecret(input: AddVaultSecretInput, env: NodeJS.ProcessEnv = process.env): Promise<VaultSecretRecord> {
  const records = await listVaultSecrets(env);
  if (records.some((record) => record.name === input.name)) throw new Error(`vault secret ${input.name} already exists`);
  const now = new Date().toISOString();
  const record = RecordSchema.parse({ ...input, createdAt: input.createdAt ?? now, rotatedAt: input.rotatedAt ?? input.createdAt ?? now });
  await saveRecords([...records, record], env);
  await appendAudit(env, { action: "add", name: record.name, backend: record.backend, scopes: record.scopes, at: now });
  return record;
}

async function saveRecords(records: VaultSecretRecord[], env: NodeJS.ProcessEnv): Promise<void> {
  const home = resolveVantaHome(storageEnv(env)), path = manifestPath(env), temp = `${path}.tmp`;
  await mkdir(home, { recursive: true });
  await writeFile(temp, `${JSON.stringify({ version: 1, secrets: records }, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export function vaultSecretStatus(record: VaultSecretRecord, now = new Date()): { stale: boolean; overbroad: boolean; expired: boolean } {
  return {
    stale: now.getTime() - Date.parse(record.rotatedAt) > STALE_MS,
    overbroad: record.scopes.includes("*"),
    expired: record.expiresAt ? Date.parse(record.expiresAt) <= now.getTime() : false,
  };
}

function providerFor(backend: VaultBackend, exec: ExecFn) {
  return backend === "bitwarden" ? bitwardenProvider(exec) : onePasswordProvider(exec);
}

function scopeAllows(record: VaultSecretRecord, scope: string): boolean {
  return record.scopes.includes("*") || record.scopes.includes(scope);
}

export async function resolveVaultSecret(name: string, scope: string, env: NodeJS.ProcessEnv, exec: ExecFn): Promise<boolean> {
  const record = (await listVaultSecrets(env)).find((item) => item.name === name);
  if (!record) throw new Error(`vault secret not found: ${name}`);
  if (!scopeAllows(record, scope)) throw new Error(`${name} is not granted to scope ${scope}`);
  return (await providerFor(record.backend, exec).get(record.ref)) !== null;
}

export async function injectVaultSecrets(scope: string, env: NodeJS.ProcessEnv, exec: ExecFn): Promise<{ injected: string[]; missing: string[] }> {
  const records = (await listVaultSecrets(env)).filter((record) => scopeAllows(record, scope));
  const injected: string[] = [], missing: string[] = [];
  for (const record of records) {
    const value = await providerFor(record.backend, exec).get(record.ref);
    if (value === null) missing.push(record.name);
    else { env[record.name] = value; injected.push(record.name); }
  }
  return { injected, missing };
}

export async function activateVaultEnvironment(env: NodeJS.ProcessEnv, exec: ExecFn): Promise<{ scope: string | null; injected: string[]; missing: string[] }> {
  const scope = env.VANTA_SECRET_SCOPE || (env.VANTA_PROFILE ? `profile:${env.VANTA_PROFILE}` : "");
  if (!scope) return { scope: null, injected: [], missing: [] };
  env.VANTA_SECRET_SCOPE = scope;
  const result = await injectVaultSecrets(scope, env, exec);
  return { scope, ...result };
}

export type RotateOptions = { env: NodeJS.ProcessEnv; exec: ExecFn; confirmed: boolean; now?: Date };

export async function rotateVaultSecret(name: string, toRef: string, options: RotateOptions): Promise<VaultSecretRecord> {
  if (!options.confirmed) throw new Error("rotation needs operator confirmation");
  const records = await listVaultSecrets(options.env);
  const index = records.findIndex((record) => record.name === name);
  if (index < 0) throw new Error(`vault secret not found: ${name}`);
  const current = records[index]!;
  if (await providerFor(current.backend, options.exec).get(toRef) === null) throw new Error("new vault reference could not be resolved");
  const at = (options.now ?? new Date()).toISOString();
  const updated = { ...current, ref: toRef, rotatedAt: at };
  records[index] = updated;
  await saveRecords(records, options.env);
  await appendAudit(options.env, {
    action: "rotate", name, backend: current.backend, scopes: current.scopes, at,
    oldRefHash: hash(current.ref), newRefHash: hash(toRef), outcome: "verified",
  });
  return updated;
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function appendAudit(env: NodeJS.ProcessEnv, event: Record<string, unknown>): Promise<void> {
  await mkdir(resolveVantaHome(storageEnv(env)), { recursive: true });
  await appendFile(auditPath(env), `${JSON.stringify(event)}\n`, "utf8");
}

export function bootstrapStatus(backend: VaultBackend, env: NodeJS.ProcessEnv): "present" | "missing" {
  const present = backend === "bitwarden"
    ? Boolean(env.BW_SESSION)
    : Boolean(env.OP_SERVICE_ACCOUNT_TOKEN || env.OP_CONNECT_TOKEN || env.OP_SESSION);
  return present ? "present" : "missing";
}
