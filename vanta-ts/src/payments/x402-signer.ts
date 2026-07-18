import { ExactEvmScheme } from "@x402/evm/exact/client";
import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { defaultExec, type ExecFn } from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import type { X402Signer } from "./x402.js";

const BASE_SEPOLIA = "eip155:84532";
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

export type X402SecretResolver = (alias: string) => Promise<string | null>;

export type VaultX402SignerOptions = {
  env?: NodeJS.ProcessEnv;
  exec?: ExecFn;
  resolveSecret?: X402SecretResolver;
};

function defaultResolver(options: VaultX402SignerOptions): X402SecretResolver {
  const env = options.env ?? process.env;
  const exec = options.exec ?? defaultExec;
  return (alias) => resolveVaultSecretValue(alias, "payment:x402", env, exec);
}

export function createVaultX402Signer(options: VaultX402SignerOptions = {}): X402Signer {
  const resolveSecret = options.resolveSecret ?? defaultResolver(options);
  return async (request): Promise<PaymentPayload> => {
    if (request.requirement.network !== BASE_SEPOLIA) {
      throw new Error(`x402 wallet signer does not support ${request.requirement.network}`);
    }
    const value = await resolveSecret(request.credentialRef);
    if (!value || !PRIVATE_KEY.test(value)) throw new Error("x402 vault signer is unavailable");

    const account = privateKeyToAccount(value as `0x${string}`);
    const signed = await new ExactEvmScheme(account).createPaymentPayload(2, request.requirement);
    return PaymentPayloadV2Schema.parse({
      x402Version: 2,
      resource: request.resource,
      accepted: request.requirement,
      payload: signed.payload,
      extensions: signed.extensions,
    }) as PaymentPayload;
  };
}
