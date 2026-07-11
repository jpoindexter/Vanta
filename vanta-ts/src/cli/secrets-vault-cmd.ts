import { defaultExec, type ExecFn } from "../secrets/provider.js";
import {
  addVaultSecret, bootstrapStatus, listVaultSecrets, resolveVaultSecret, rotateVaultSecret, vaultSecretStatus,
  type VaultBackend,
} from "../secrets/vault-manager.js";

type Deps = { env?: NodeJS.ProcessEnv; exec?: ExecFn; log?: (line: string) => void; now?: () => Date };
type CommandContext = { env: NodeJS.ProcessEnv; exec: ExecFn; log: (line: string) => void; now?: () => Date };
type Flags = Record<string, string>;
const USAGE = "usage: vanta secrets vault add|status|resolve|rotate ...";

export async function runSecretsCommand(rest: string[], deps: Deps = {}): Promise<number> {
  const ctx = { env: deps.env ?? process.env, exec: deps.exec ?? defaultExec, log: deps.log ?? console.log, now: deps.now };
  if (rest[0] !== "vault") { ctx.log(USAGE); return 1; }
  try {
    return await routeVaultCommand(rest.slice(1), ctx);
  } catch (error) { ctx.log(`vault secret error: ${(error as Error).message}`); return 1; }
}

async function routeVaultCommand(rest: string[], ctx: CommandContext): Promise<number> {
  const action = rest[0], args = rest.slice(1);
  if (action === "add") return addCommand(args, ctx.env, ctx.log, ctx.now);
  if (action === "status" || action === "list") return statusCommand(ctx.env, ctx.log, ctx.now?.() ?? new Date());
  if (action === "resolve") return resolveCommand(args, ctx.env, ctx.exec, ctx.log);
  if (action === "rotate") return rotateCommand(args, ctx);
  ctx.log(USAGE); return 1;
}

async function addCommand(args: string[], env: NodeJS.ProcessEnv, log: (line: string) => void, now?: () => Date): Promise<number> {
  const name = args[0], flags = parseFlags(args.slice(1));
  const backend = flags.backend as VaultBackend, ref = flags.ref;
  if (!name || !["bitwarden", "1password"].includes(backend) || !ref || !flags.scope) throw new Error("add needs NAME --backend bitwarden|1password --ref REF --scope SCOPE[,SCOPE]");
  const at = (now?.() ?? new Date()).toISOString();
  const record = await addVaultSecret({ name, backend, ref, scopes: flags.scope.split(","), createdAt: at, expiresAt: flags.expires }, env);
  log(`added ${record.name} · ${record.backend} · scopes ${record.scopes.join(",")} · bootstrap ${bootstrapStatus(record.backend, env)}`);
  return 0;
}

async function statusCommand(env: NodeJS.ProcessEnv, log: (line: string) => void, now: Date): Promise<number> {
  const records = await listVaultSecrets(env);
  if (!records.length) { log("(no vault secrets configured)"); return 0; }
  for (const record of records) {
    const status = vaultSecretStatus(record, now);
    const flags = [status.stale && "stale", status.overbroad && "overbroad", status.expired && "expired"].filter(Boolean);
    log(`${record.name}\t${record.backend}\tbootstrap ${bootstrapStatus(record.backend, env)}\t${flags.join(",") || "ok"}\t${record.scopes.join(",")}`);
  }
  return 0;
}

async function resolveCommand(args: string[], env: NodeJS.ProcessEnv, exec: ExecFn, log: (line: string) => void): Promise<number> {
  const name = args[0], flags = parseFlags(args.slice(1)), scope = flags.scope;
  if (!name || !scope) throw new Error("resolve needs NAME --scope SCOPE");
  const resolved = await resolveVaultSecret(name, scope, env, exec);
  log(resolved ? `resolved ${name} for ${scope} (value redacted)` : `missing ${name} for ${scope}`);
  return resolved ? 0 : 1;
}

async function rotateCommand(args: string[], ctx: CommandContext): Promise<number> {
  const name = args[0], flags = parseFlags(args.slice(1)), toRef = flags["to-ref"];
  if (!name || !toRef) throw new Error("rotate needs NAME --to-ref REF [--yes]");
  if (flags.yes !== "true") { ctx.log(`rotation preview: ${name} will switch to a verified new vault reference; rerun with --yes`); return 2; }
  const record = await rotateVaultSecret(name, toRef, { env: ctx.env, exec: ctx.exec, confirmed: true, now: ctx.now?.() });
  ctx.log(`rotated ${record.name} · ${record.backend} · new reference verified · audit receipt written`);
  return 0;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (token === "--yes") { flags.yes = "true"; continue; }
    if (!token.startsWith("--") || !args[index + 1]) throw new Error(`invalid option ${token}`);
    flags[token.slice(2)] = args[++index]!;
  }
  return flags;
}
