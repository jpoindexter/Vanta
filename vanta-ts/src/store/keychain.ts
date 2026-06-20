// VANTA-KEYCHAIN-STORAGE — opt-in macOS Keychain credential storage.
//
// Pure argv builders for the `security` generic-password verbs + an injected
// runner so secrets round-trip through the real Keychain in production but a
// fake runner in tests. Rule zero: the secret is passed to `security` via
// stdin (never argv, never a log line) and is NEVER returned in an error.

import { execFile } from "node:child_process";

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

/** `security` exits 44 when find/delete cannot locate the item. */
const ITEM_NOT_FOUND_EXIT = 44;

/**
 * Default runner: execFile (no shell — argv is not interpolated into a
 * string), secret piped via stdin so it never appears in argv or `ps`.
 */
export const defaultKeychainRunner: KeychainRunner = (args, stdin) =>
  new Promise((resolve) => {
    const child = execFile(
      "security",
      [...args],
      { timeout: 15_000 },
      (err, stdout) => {
        if (!err) {
          resolve({ ok: true, stdout: stdout.trim() });
          return;
        }
        const code = (err as NodeJS.ErrnoException & { code?: number }).code;
        const notFound = code === ITEM_NOT_FOUND_EXIT;
        // Generic message only — never echo the secret or full command.
        resolve({ ok: false, error: "security command failed", notFound });
      },
    );
    if (stdin !== undefined) {
      child.stdin?.end(stdin);
    }
  });

/**
 * argv for `security add-generic-password`. `-U` updates in place if the item
 * exists. `-w` with no value reads the secret from stdin (NOT from argv), so
 * the secret never lands in process listings or shell history.
 */
export function buildKeychainAddArgs(service: string, account: string): string[] {
  return ["add-generic-password", "-U", "-a", account, "-s", service, "-w"];
}

/** argv for `security find-generic-password -w` — prints the secret to stdout. */
export function buildKeychainFindArgs(service: string, account: string): string[] {
  return ["find-generic-password", "-a", account, "-s", service, "-w"];
}

/** argv for `security delete-generic-password`. */
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

/** Store (or update) a secret. Errors-as-values; the secret goes via stdin. */
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
