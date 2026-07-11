import { providerById } from "../providers/catalog.js";
import { defaultExec, type ExecFn } from "../secrets/provider.js";
import { addCredential, listCredentials, removeCredential, type CredentialSource } from "../credentials/pool.js";
import { resolveCredential } from "../credentials/resolve.js";

type Deps = { env?: NodeJS.ProcessEnv; exec?: ExecFn; log?: (line: string) => void; now?: () => Date };
type Context = { env: NodeJS.ProcessEnv; exec: ExecFn; log: (line: string) => void; now: () => Date };
const SOURCES = ["env", "keychain", "bitwarden", "1password", "vault"] as const;
const USAGE = "usage: vanta auth pool list | add <provider> <id> --source env|keychain|bitwarden|1password|vault --ref <reference> | remove <provider> <id> | test <provider> <id>";

export async function runAuthPoolCommand(args: string[], deps: Deps = {}): Promise<number> {
  const ctx = { env: deps.env ?? process.env, exec: deps.exec ?? defaultExec, log: deps.log ?? console.log, now: deps.now ?? (() => new Date()) };
  try { return await route(args, ctx); }
  catch (error) { ctx.log(`credential pool error: ${(error as Error).message}`); return 1; }
}

async function route(args: string[], ctx: Context): Promise<number> {
  const action = args[0];
  if (action === "list") return list(ctx);
  if (action === "add") return add(args.slice(1), ctx);
  if (action === "remove") return remove(args.slice(1), ctx);
  if (action === "test") return test(args.slice(1), ctx);
  ctx.log(USAGE);
  return 1;
}

async function list(ctx: Context): Promise<number> {
  const records = await listCredentials(ctx.env);
  for (const item of records) ctx.log(`${item.provider}/${item.id}\t${item.status}\t${item.source}:${item.ref}\t${item.cooldownUntil ?? "ready"}`);
  if (!records.length) ctx.log("(no credential pools configured)");
  ctx.log("Rotation stays on the same provider/model before fallback; provider cache behavior is preserved, account-level caches may differ.");
  return 0;
}

async function add(args: string[], ctx: Context): Promise<number> {
  const provider = args[0] ?? "", id = args[1] ?? "", flags = parseFlags(args.slice(2));
  const source = flags.source as CredentialSource, ref = flags.ref;
  if (!providerById(provider)?.envVar) throw new Error(`provider "${provider}" does not support API-key pooling`);
  if (!SOURCES.includes(source) || !ref) throw new Error("add needs --source and --ref; literal credential values are not accepted");
  const record = await addCredential({ provider, id, source, ref }, ctx.env, ctx.now());
  ctx.log(`added ${record.provider}/${record.id} · ${record.source}:${record.ref} · value not stored`);
  return 0;
}

async function remove(args: string[], ctx: Context): Promise<number> {
  const provider = args[0], id = args[1];
  if (!provider || !id) throw new Error("remove needs provider and id");
  if (!await removeCredential(provider, id, ctx.env)) throw new Error(`credential ${provider}/${id} not found`);
  ctx.log(`removed ${provider}/${id}`);
  return 0;
}

async function test(args: string[], ctx: Context): Promise<number> {
  const provider = args[0], id = args[1];
  const record = (await listCredentials(ctx.env)).find((item) => item.provider === provider && item.id === id);
  if (!record) throw new Error(`credential ${provider}/${id} not found`);
  const value = await resolveCredential({ leaseId: "test", id: record.id, source: record.source, ref: record.ref }, ctx.env, ctx.exec);
  ctx.log(value ? `${provider}/${id} resolved (value redacted)` : `${provider}/${id} unavailable`);
  return value ? 0 : 1;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!flag?.startsWith("--") || !value) throw new Error(`invalid option ${flag ?? ""}`);
    flags[flag.slice(2)] = value;
  }
  return flags;
}
