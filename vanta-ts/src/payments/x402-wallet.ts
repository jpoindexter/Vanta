import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { addVaultSecret, listVaultSecrets, removeVaultSecret } from "../secrets/vault-manager.js";
import { deleteSecret, getSecret, setSecret, type KeychainRunner } from "../store/keychain.js";

export const X402_WALLET_ALIAS = "X402_TEST_SIGNER";

export type X402WalletSetupDeps = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  keychainRun?: KeychainRunner;
  generateKey?: () => `0x${string}`;
};

export type X402WalletSetupResult =
  | { ok: true; state: "created"; alias: typeof X402_WALLET_ALIAS; address: `0x${string}` }
  | { ok: false; state: "unsupported_platform" | "already_configured" | "keychain_write_failed" | "vault_registration_failed" };

function keychainRef(root: string): string {
  const project = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return `vanta-x402-${project}`;
}

export async function createX402TestWallet(
  root: string,
  deps: X402WalletSetupDeps = {},
): Promise<X402WalletSetupResult> {
  if ((deps.platform ?? process.platform) !== "darwin") return { ok: false, state: "unsupported_platform" };
  const env = deps.env ?? process.env;
  const existing = (await listVaultSecrets(env)).find((record) => record.name === X402_WALLET_ALIAS);
  if (existing) {
    if (existing.backend !== "keychain") return { ok: false, state: "already_configured" };
    const current = await getSecret({ service: existing.ref, account: "vanta" }, deps.keychainRun);
    if (!current.ok || current.value) return { ok: false, state: "already_configured" };
    await deleteSecret({ service: existing.ref, account: "vanta" }, deps.keychainRun);
    await removeVaultSecret(X402_WALLET_ALIAS, { env, confirmed: true });
  }

  const privateKey = (deps.generateKey ?? generatePrivateKey)();
  const address = privateKeyToAccount(privateKey).address;
  const key = { service: keychainRef(root), account: "vanta" };
  if (!(await setSecret(key, privateKey, deps.keychainRun)).ok) {
    return { ok: false, state: "keychain_write_failed" };
  }
  try {
    await addVaultSecret({
      name: X402_WALLET_ALIAS,
      backend: "keychain",
      ref: key.service,
      scopes: ["payment:x402"],
    }, env);
  } catch {
    await deleteSecret(key, deps.keychainRun);
    return { ok: false, state: "vault_registration_failed" };
  }
  return { ok: true, state: "created", alias: X402_WALLET_ALIAS, address };
}
