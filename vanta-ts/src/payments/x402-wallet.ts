import { createHash } from "node:crypto";
import { createPublicClient, formatUnits, http } from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { defaultExec, type ExecFn } from "../secrets/provider.js";
import { addVaultSecret, listVaultSecrets, removeVaultSecret, resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { deleteSecret, getSecret, setSecret, type KeychainRunner } from "../store/keychain.js";

export const X402_WALLET_ALIAS = "X402_TEST_SIGNER";
export const X402_BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const X402_CIRCLE_FAUCET_URL = "https://faucet.circle.com/?allow=true";
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;
const BALANCE_OF_ABI = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }],
}] as const;

export type X402WalletSetupDeps = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  keychainRun?: KeychainRunner;
  generateKey?: () => `0x${string}`;
};

export type X402WalletSetupResult =
  | { ok: true; state: "created"; alias: typeof X402_WALLET_ALIAS; address: `0x${string}` }
  | { ok: false; state: "unsupported_platform" | "already_configured" | "keychain_write_failed" | "vault_registration_failed" };

export type X402WalletStatusDeps = {
  env?: NodeJS.ProcessEnv;
  exec?: ExecFn;
  resolveSecret?: (alias: string) => Promise<string | null>;
  readBalance?: (address: `0x${string}`) => Promise<bigint>;
};

export type X402WalletStatus =
  | {
    ok: true;
    state: "funded" | "unfunded" | "balance_unavailable";
    alias: typeof X402_WALLET_ALIAS;
    address: `0x${string}`;
    network: "eip155:84532";
    asset: typeof X402_BASE_SEPOLIA_USDC;
    balanceAtomic: string | null;
    balanceUsdc: string | null;
    faucetUrl: typeof X402_CIRCLE_FAUCET_URL;
  }
  | { ok: false; state: "wallet_unavailable" };

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

async function baseSepoliaUsdcBalance(address: `0x${string}`, env: NodeJS.ProcessEnv): Promise<bigint> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(env.VANTA_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
  });
  return await client.readContract({
    address: X402_BASE_SEPOLIA_USDC,
    abi: BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

export async function inspectX402TestWallet(deps: X402WalletStatusDeps = {}): Promise<X402WalletStatus> {
  const env = deps.env ?? process.env;
  try {
    const value = await (deps.resolveSecret
      ? deps.resolveSecret(X402_WALLET_ALIAS)
      : resolveVaultSecretValue(X402_WALLET_ALIAS, "payment:x402", env, deps.exec ?? defaultExec));
    if (!value || !PRIVATE_KEY.test(value)) return { ok: false, state: "wallet_unavailable" };
    const address = privateKeyToAccount(value as `0x${string}`).address;
    try {
      const balance = await (deps.readBalance
        ? deps.readBalance(address)
        : baseSepoliaUsdcBalance(address, env));
      return {
        ok: true,
        state: balance > 0n ? "funded" : "unfunded",
        alias: X402_WALLET_ALIAS,
        address,
        network: "eip155:84532",
        asset: X402_BASE_SEPOLIA_USDC,
        balanceAtomic: balance.toString(),
        balanceUsdc: formatUnits(balance, 6),
        faucetUrl: X402_CIRCLE_FAUCET_URL,
      };
    } catch {
      return {
        ok: true,
        state: "balance_unavailable",
        alias: X402_WALLET_ALIAS,
        address,
        network: "eip155:84532",
        asset: X402_BASE_SEPOLIA_USDC,
        balanceAtomic: null,
        balanceUsdc: null,
        faucetUrl: X402_CIRCLE_FAUCET_URL,
      };
    }
  } catch {
    return { ok: false, state: "wallet_unavailable" };
  }
}
