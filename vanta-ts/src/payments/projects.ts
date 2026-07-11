import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { deleteSecret, setSecret, type KeychainRunner } from "../store/keychain.js";
import { addVaultSecrets, listVaultSecrets } from "../secrets/vault-manager.js";
import type { PaymentContract } from "./contract.js";
import { paymentCommandEnv, type PaymentCommandResult, type ProviderOutcome } from "./providers.js";

type ProvisionContract = Extract<PaymentContract, { provider: "stripe_projects" }>;
export type StripeProjectsRunner = (args: string[], cwd: string, timeoutMs: number) => Promise<PaymentCommandResult>;
export type StripeProjectsDeps = {
  env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; run?: StripeProjectsRunner; keychainRun?: KeychainRunner;
};

export const liveStripeProjectsCommand: StripeProjectsRunner = async (args, cwd, timeoutMs) => {
  const command = process.env.VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI;
  if (!command) return { code: 127, stdout: "", stderr: "test Stripe Projects adapter is not configured" };
  return new Promise((resolve) => execFile(command, args, {
    cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, env: paymentCommandEnv(process.env),
  }, (error, stdout, stderr) => resolve({ code: error ? 1 : 0, stdout, stderr })));
};

function keychainRef(root: string, alias: string): string {
  const project = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return `vanta-stripe-projects-${project}-${alias.toLowerCase().replaceAll("_", "-")}`;
}

async function generatedCredentials(path: string, aliases: readonly string[]): Promise<Record<string, string> | null> {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 65_536) return null;
  await chmod(path, 0o600);
  const values = parseEnv(await readFile(path, "utf8")), keys = Object.keys(values).sort();
  if (keys.join("\0") !== [...aliases].sort().join("\0")) return null;
  const result: Record<string, string> = {};
  for (const key of keys) { const value = values[key]; if (!value) return null; result[key] = value; }
  return result;
}

async function storeCredentials(root: string, contract: ProvisionContract, values: Record<string, string>, deps: StripeProjectsDeps): Promise<boolean> {
  const aliases = contract.provisioning.credentialVaultRefs, env = deps.env ?? process.env;
  if ((await listVaultSecrets(env)).some((record) => aliases.includes(record.name))) return false;
  const stored: Array<{ service: string; account: string }> = [];
  try {
    for (const alias of aliases) {
      const key = { service: keychainRef(root, alias), account: "vanta" };
      if (!(await setSecret(key, values[alias]!, deps.keychainRun)).ok) throw new Error("keychain write failed");
      stored.push(key);
    }
    await addVaultSecrets(aliases.map((name) => ({
      name, backend: "keychain" as const, ref: keychainRef(root, name), scopes: ["payment:stripe-projects"],
    })), env);
    return true;
  } catch {
    await Promise.all(stored.map((key) => deleteSecret(key, deps.keychainRun)));
    return false;
  }
}

export async function executeStripeProjects(root: string, contract: ProvisionContract, deps: StripeProjectsDeps = {}): Promise<ProviderOutcome> {
  const env = deps.env ?? process.env, platform = deps.platform ?? process.platform;
  if (platform !== "darwin" || env.VANTA_KEYCHAIN !== "1") return { ok: false, state: "vault_sink_unavailable", external: "not_available" };
  const workspace = await mkdtemp(join(tmpdir(), "vanta-stripe-projects-")), run = deps.run ?? liveStripeProjectsCommand;
  try {
    return await provisionWorkspace({ root, contract, workspace, run, deps });
  } catch { return { ok: false, state: "projects_adapter_error", external: "not_available" }; }
  finally { await rm(workspace, { recursive: true, force: true }); }
}

async function provisionWorkspace(options: { root: string; contract: ProvisionContract; workspace: string; run: StripeProjectsRunner; deps: StripeProjectsDeps }): Promise<ProviderOutcome> {
  const { root, contract, workspace, run, deps } = options;
  if ((await run(["projects", "init"], workspace, 60_000)).code !== 0) return { ok: false, state: "projects_init_failed", external: "not_available" };
  if ((await run(["projects", "add", contract.provisioning.service], workspace, 310_000)).code !== 0) return { ok: false, state: "projects_provisioning_failed", external: "denied" };
  const envPath = join(workspace, ".env"), values = await generatedCredentials(envPath, contract.provisioning.credentialVaultRefs);
  await rm(envPath, { force: true });
  if (!values) return { ok: false, state: "generated_credentials_mismatch", external: "not_available" };
  if (!await storeCredentials(root, contract, values, deps)) return { ok: false, state: "vault_store_failed", external: "not_available" };
  return { ok: true, state: "service_provisioned_vaulted", external: "approved" };
}
