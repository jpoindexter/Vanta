import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { bitwardenProvider, keychainProvider, onePasswordProvider, type ExecFn } from "./provider.js";

const BackendSchema = z.enum(["bitwarden", "1password", "keychain"]);
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
  return (await addVaultSecrets([input], env))[0]!;
}

export async function addVaultSecrets(inputs: readonly AddVaultSecretInput[], env: NodeJS.ProcessEnv = process.env): Promise<VaultSecretRecord[]> {
  const records = await listVaultSecrets(env);
  const names = inputs.map((input) => input.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index || records.some((record) => record.name === name));
  if (duplicate) throw new Error(`vault secret ${duplicate} already exists`);
  const now = new Date().toISOString();
  const added = inputs.map((input) => RecordSchema.parse({ ...input, createdAt: input.createdAt ?? now, rotatedAt: input.rotatedAt ?? input.createdAt ?? now }));
  await saveRecords([...records, ...added], env);
  for (const record of added) await appendAudit(env, { action: "add", name: record.name, backend: record.backend, scopes: record.scopes, at: now });
  return added;
}

export async function removeVaultSecret(
  name: string,
  options: { env?: NodeJS.ProcessEnv; confirmed: boolean; now?: Date },
): Promise<VaultSecretRecord> {
  if (!options.confirmed) throw new Error("vault secret removal needs operator confirmation");
  const env = options.env ?? process.env;
  const records = await listVaultSecrets(env);
  const index = records.findIndex((record) => record.name === name);
  if (index < 0) throw new Error(`vault secret not found: ${name}`);
  const [removed] = records.splice(index, 1);
  await saveRecords(records, env);
  await appendAudit(env, {
    action: "remove", name: removed!.name, backend: removed!.backend,
    scopes: removed!.scopes, at: (options.now ?? new Date()).toISOString(),
    refHash: hash(removed!.ref),
  });
  return removed!;
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
  if (backend === "bitwarden") return bitwardenProvider(exec);
  if (backend === "1password") return onePasswordProvider(exec);
  return keychainProvider(exec);
}

function scopeAllows(record: VaultSecretRecord, scope: string): boolean {
  return record.scopes.includes("*") || record.scopes.includes(scope);
}

export async function resolveVaultSecret(name: string, scope: string, env: NodeJS.ProcessEnv, exec: ExecFn): Promise<boolean> {
  return (await resolveVaultSecretValue(name, scope, env, exec)) !== null;
}

export async function resolveVaultSecretValue(name: string, scope: string, env: NodeJS.ProcessEnv, exec: ExecFn): Promise<string | null> {
  const record = (await listVaultSecrets(env)).find((item) => item.name === name);
  if (!record) throw new Error(`vault secret not found: ${name}`);
  if (!scopeAllows(record, scope)) throw new Error(`${name} is not granted to scope ${scope}`);
  return providerFor(record.backend, exec).get(record.ref);
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
    : backend === "1password"
      ? Boolean(env.OP_SERVICE_ACCOUNT_TOKEN || env.OP_CONNECT_TOKEN || env.OP_SESSION)
      : process.platform === "darwin" && env.VANTA_KEYCHAIN === "1";
  return present ? "present" : "missing";
}
