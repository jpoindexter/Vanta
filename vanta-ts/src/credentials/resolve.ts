import { providerById } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";
import {
  bitwardenProvider, defaultExec, envProvider, keychainProvider, onePasswordProvider, type ExecFn,
} from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { CredentialPoolProvider } from "./provider.js";
import { leaseCredential, markCredentialFailure, releaseCredential, type CredentialLease } from "./pool.js";

export async function resolveCredential(lease: CredentialLease, env: NodeJS.ProcessEnv, exec: ExecFn = defaultExec): Promise<string | null> {
  if (lease.source === "env") return envProvider(env).get(lease.ref);
  if (lease.source === "keychain") return keychainProvider(exec).get(lease.ref);
  if (lease.source === "bitwarden") return bitwardenProvider(exec).get(lease.ref);
  if (lease.source === "1password") return onePasswordProvider(exec).get(lease.ref);
  const scope = env.VANTA_SECRET_SCOPE ?? (env.VANTA_PROFILE ? `profile:${env.VANTA_PROFILE}` : "*");
  return resolveVaultSecretValue(lease.ref, scope, env, exec);
}

export function wrapCredentialPool(base: LLMProvider, env: NodeJS.ProcessEnv, owner: string, exec: ExecFn = defaultExec): LLMProvider {
  const providerId = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const keyEnv = providerById(providerId)?.envVar;
  if (!keyEnv) return base;
  return new CredentialPoolProvider(base, {
    providerId, owner,
    lease: () => leaseCredential(providerId, owner, env),
    resolve: (lease) => resolveCredential(lease, env, exec),
    makeProvider: (credential) => resolveProvider({ ...env, [keyEnv]: credential }),
    failure: (leaseId, error) => markCredentialFailure(leaseId, error, env),
    release: (leaseId) => releaseCredential(leaseId, env),
  });
}
