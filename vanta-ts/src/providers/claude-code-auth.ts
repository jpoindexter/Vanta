import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Resolve a Claude Pro/Max OAuth token for programmatic use (grey area — see
// DECISIONS 2026-06-02). Source order: explicit env token → Claude Code's
// credential FILE (~/.claude/.credentials.json, older installs) → the macOS
// KEYCHAIN ("Claude Code-credentials", where modern Claude Code stores it).
// Both stores hold the same {claudeAiOauth:{accessToken,expiresAt}} shape, so one
// parser covers both. No refresh here: an expired token errors with a clear
// "run claude to refresh" message rather than guessing the refresh client_id.

export type ClaudeCodeAuth = { token: string; expiresAt?: number };

/** Reads the raw credential JSON blob from the OS keychain, or null. Injectable for tests. */
export type KeychainReader = (env: NodeJS.ProcessEnv) => string | null;

/** True when `expiresAt` (epoch ms) is in the past. Unknown expiry = not expired. */
export function isTokenExpired(expiresAt: number | undefined, nowMs: number): boolean {
  return typeof expiresAt === "number" && expiresAt > 0 && expiresAt <= nowMs;
}

export function credentialsPath(env: NodeJS.ProcessEnv): string {
  return join(env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"), ".credentials.json");
}

/** Parse a Claude Code credential blob (from file or keychain) into auth. Null if shapeless. */
function parseClaudeOauth(raw: string): ClaudeCodeAuth | null {
  try {
    const oauth = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } })
      ?.claudeAiOauth;
    if (oauth && typeof oauth.accessToken === "string" && oauth.accessToken) {
      return { token: oauth.accessToken, expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : undefined };
    }
  } catch {
    // not JSON — fall through
  }
  return null;
}

/** Default keychain source: the macOS login keychain item Claude Code writes. No-op off macOS. */
function macKeychainBlob(env: NodeJS.ProcessEnv): string | null {
  if (process.platform !== "darwin") return null;
  const service = env.VANTA_CLAUDE_KEYCHAIN_SERVICE?.trim() || "Claude Code-credentials";
  try {
    const out = execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    return out.trim() || null;
  } catch {
    return null; // item missing / security unavailable
  }
}

/** Read the OAuth token from env, then the creds file, then the macOS keychain. Null if absent. */
export function readClaudeCodeAuth(
  env: NodeJS.ProcessEnv = process.env,
  keychain: KeychainReader = macKeychainBlob,
): ClaudeCodeAuth | null {
  const envToken = env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (envToken) return { token: envToken };

  try {
    const fromFile = parseClaudeOauth(readFileSync(credentialsPath(env), "utf8"));
    if (fromFile) return fromFile;
  } catch {
    // no creds file / unreadable — try the keychain next
  }

  const blob = keychain(env);
  if (blob) {
    const fromKeychain = parseClaudeOauth(blob);
    if (fromKeychain) return fromKeychain;
  }
  return null;
}

/**
 * Resolve a usable Claude Code token or throw an actionable error. `now` and
 * `keychain` injectable for tests.
 */
export function resolveClaudeCodeToken(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
  keychain: KeychainReader = macKeychainBlob,
): string {
  const auth = readClaudeCodeAuth(env, keychain);
  if (!auth) {
    throw new Error(
      "No Claude Code login found. Run `claude` and sign in (Pro/Max), or set CLAUDE_CODE_OAUTH_TOKEN. " +
        "Note: using a subscription token programmatically is a grey area under Anthropic's terms.",
    );
  }
  if (isTokenExpired(auth.expiresAt, now)) {
    throw new Error(
      "Claude Code token expired. Run any `claude` command once to refresh it, then retry.",
    );
  }
  return auth.token;
}
