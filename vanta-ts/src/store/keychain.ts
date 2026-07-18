// VANTA-KEYCHAIN-STORAGE — opt-in macOS Keychain credential storage.
//
// Compatibility operation builders + an injected runner so secrets round-trip
// through the native credential store in production but a fake runner in tests.
// Rule zero: the secret never enters process argv, a shell, or an error message.

import { AsyncEntry } from "@napi-rs/keyring";

/** A keychain item is addressed by (service, account). */
export interface KeychainKey {
  service: string;
  account: string;
}

/**
 * Run `security` with argv + optional stdin secret. Resolves the trimmed
 * stdout on exit 0, or an Error VALUE on any failure (never throws, never
 * embeds the secret). `notFound` distinguishes "no such item" (exit 44) from
 * a real failure so callers can treat a missing entry as a clean miss.
 */
export type KeychainRunResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; notFound: boolean };

export type KeychainRunner = (
  args: readonly string[],
  stdin?: string,
) => Promise<KeychainRunResult>;

/**
 * Default runner: translate the stable operation shape into native Keychain
 * calls. The shape is retained for test injection and compatibility with the
 * existing credential callers; no `security` child process is launched.
 */
export const defaultKeychainRunner: KeychainRunner = async (args, stdin) => {
  const account = optionValue(args, "-a");
  const service = optionValue(args, "-s");
  if (!account || !service) return keychainFailure();

  const entry = new AsyncEntry(service, account);
  try {
    switch (args[0]) {
      case "add-generic-password":
        if (stdin === undefined) return keychainFailure();
        await entry.setPassword(stdin);
        return { ok: true, stdout: "" };
      case "find-generic-password": {
        const value = await entry.getPassword();
        return value == null
          ? keychainFailure(true)
          : { ok: true, stdout: value };
      }
      case "delete-generic-password":
        return await entry.deleteCredential()
          ? { ok: true, stdout: "" }
          : keychainFailure(true);
      default:
        return keychainFailure();
    }
  } catch {
    return keychainFailure();
  }
};

function optionValue(args: readonly string[], option: string): string | null {
  const index = args.indexOf(option);
  return index >= 0 && index + 1 < args.length ? args[index + 1] ?? null : null;
}

function keychainFailure(notFound = false): KeychainRunResult {
  return { ok: false, error: "keychain operation failed", notFound };
}

/**
 * Stable add-operation shape. The value is provided separately to the runner,
 * so it never lands in process listings or shell history.
 */
export function buildKeychainAddArgs(service: string, account: string): string[] {
  return ["add-generic-password", "-U", "-a", account, "-s", service, "-w"];
}

/** Stable find-operation shape. */
export function buildKeychainFindArgs(service: string, account: string): string[] {
  return ["find-generic-password", "-a", account, "-s", service, "-w"];
}

/** Stable delete-operation shape. */
export function buildKeychainDeleteArgs(service: string, account: string): string[] {
  return ["delete-generic-password", "-a", account, "-s", service];
}

/** macOS + VANTA_KEYCHAIN=1. Off by default and on every non-macOS platform. */
export function keychainAvailable(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): boolean {
  return platform === "darwin" && env.VANTA_KEYCHAIN === "1";
}

/** Store (or update) a secret. Errors are values and never include the secret. */
export async function setSecret(
  key: KeychainKey,
  secret: string,
  run: KeychainRunner = defaultKeychainRunner,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await run(buildKeychainAddArgs(key.service, key.account), secret);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Read a secret. A missing entry is a clean miss (`{ ok: true, value: null }`),
 * not an error — callers treat it like an absent file.
 */
export async function getSecret(
  key: KeychainKey,
  run: KeychainRunner = defaultKeychainRunner,
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const result = await run(buildKeychainFindArgs(key.service, key.account));
  if (result.ok) return { ok: true, value: result.stdout };
  if (result.notFound) return { ok: true, value: null };
  return { ok: false, error: result.error };
}

/** Delete a secret. A missing entry is treated as already-deleted (success). */
export async function deleteSecret(
  key: KeychainKey,
  run: KeychainRunner = defaultKeychainRunner,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await run(buildKeychainDeleteArgs(key.service, key.account));
  if (result.ok || result.notFound) return { ok: true };
  return { ok: false, error: result.error };
}
