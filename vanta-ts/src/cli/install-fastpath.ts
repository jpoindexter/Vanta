import { providerById } from "../providers/catalog.js";

/**
 * OP-INSTALL-FASTPATH — pure provisioned-detection for the first-run wizard.
 *
 * When Vanta is already fully provisioned (a known provider + its key, with the
 * store initialized), launching should skip the first-run setup wizard and go
 * straight to the session. This module is the pure, injectable decision: no fs,
 * no provider construction — just env + an injected store signal.
 *
 * Skipping the wizard is a UX convenience only. It changes NOTHING about safety:
 * the kernel still gates every action, and a missing key just means the provider
 * call fails clearly later. The safe default, whenever provisioning is ambiguous
 * or partial, is to RUN the wizard (current behavior).
 *
 * NAMED WIRE (not wired this round): in `cli/startup.ts`, `startInteractive` on a
 * TTY first-run currently calls `ensureConfiguredOrSetup`, whose `isConfigured`
 * check is provider-resolution only. The fast-path point is there: before running
 * the wizard, check `shouldSkipWizard(process.env, { storeExists })` (storeExists
 * mirrors `gatherStatus`'s store-init signal) and bypass the wizard when true.
 */

/** Whether the env names a known provider with a usable key, and the store is ready. */
export type ProvisionState = {
  /** VANTA_PROVIDER is set to a provider Vanta knows how to resolve. */
  hasProvider: boolean;
  /** The provider's API-key env is set, OR the provider is keyless (local/sub). */
  hasKey: boolean;
  /** The Vanta store has been initialized (injected — no fs in this module). */
  storeReady: boolean;
};

/** Injected, side-effect-free signals so detection stays pure (no real fs). */
export type ProvisionDeps = {
  /** Whether the Vanta store dir/files already exist (mirrors gatherStatus). */
  storeExists: boolean;
};

/** Forcing the wizard even when fully provisioned (e.g. to reconfigure). */
const FORCE_SETUP_ENV = "VANTA_FORCE_SETUP";

/**
 * Derive the provisioned state from the environment + injected store signal.
 *
 * - hasProvider: `VANTA_PROVIDER` is set to a provider in the catalog.
 * - hasKey: the catalog entry's `envVar` is set, OR the entry is keyless
 *   (`envVar: null` — Ollama, LM Studio, claude-code, codex, custom: local/sub
 *   backends that need no API key). No provider → no key.
 * - storeReady: straight from `deps.storeExists`.
 */
export function detectProvisionState(env: NodeJS.ProcessEnv, deps: ProvisionDeps): ProvisionState {
  const id = env.VANTA_PROVIDER?.toLowerCase();
  const entry = id ? providerById(id) : undefined;
  const hasProvider = entry !== undefined;
  const hasKey = entry === undefined ? false : entry.envVar === null || Boolean(env[entry.envVar]);
  return { hasProvider, hasKey, storeReady: deps.storeExists };
}

/** Fully provisioned = a known provider AND a usable key AND an initialized store. */
export function isFullyProvisioned(state: ProvisionState): boolean {
  return state.hasProvider && state.hasKey && state.storeReady;
}

/**
 * Whether launching should skip the first-run wizard. True only when fully
 * provisioned — UNLESS `VANTA_FORCE_SETUP=1` forces the wizard. Anything partial
 * or ambiguous returns false (run the wizard — the safe default).
 */
export function shouldSkipWizard(env: NodeJS.ProcessEnv, deps: ProvisionDeps): boolean {
  if (env[FORCE_SETUP_ENV] === "1") return false;
  return isFullyProvisioned(detectProvisionState(env, deps));
}

/** A one-line why, for `--verbose`/doctor. Names the missing piece when running setup. */
export function fastpathReason(state: ProvisionState): string {
  if (isFullyProvisioned(state)) return "skipping setup: provider+key+store ready";
  const missing: string[] = [];
  if (!state.hasProvider) missing.push("no provider");
  else if (!state.hasKey) missing.push("no key");
  if (!state.storeReady) missing.push("no store");
  return `running setup: ${missing.join(", ")}`;
}
