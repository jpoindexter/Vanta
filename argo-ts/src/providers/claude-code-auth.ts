import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Resolve a Claude Pro/Max OAuth token for programmatic use (grey area — see
// DECISIONS 2026-06-02). Source order: explicit env token, then Claude Code's
// own credential store (~/.claude/.credentials.json), which Claude Code keeps
// refreshed when it runs. No refresh here: an expired token errors with a clear
// "run claude to refresh" message rather than guessing the refresh client_id.

export type ClaudeCodeAuth = { token: string; expiresAt?: number };

/** True when `expiresAt` (epoch ms) is in the past. Unknown expiry = not expired. */
export function isTokenExpired(expiresAt: number | undefined, nowMs: number): boolean {
  return typeof expiresAt === "number" && expiresAt > 0 && expiresAt <= nowMs;
}

function credentialsPath(env: NodeJS.ProcessEnv): string {
  return join(env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"), ".credentials.json");
}

/** Read the OAuth token from env or Claude Code's credential store. Null if absent. */
export function readClaudeCodeAuth(env: NodeJS.ProcessEnv = process.env): ClaudeCodeAuth | null {
  const envToken = env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (envToken) return { token: envToken };

  try {
    const raw: unknown = JSON.parse(readFileSync(credentialsPath(env), "utf8"));
    const oauth = (raw as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } })?.claudeAiOauth;
    if (oauth && typeof oauth.accessToken === "string" && oauth.accessToken) {
      return {
        token: oauth.accessToken,
        expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : undefined,
      };
    }
  } catch {
    // no creds file / unreadable — fall through to "not found"
  }
  return null;
}

/**
 * Resolve a usable Claude Code token or throw an actionable error. `now`
 * injectable for tests.
 */
export function resolveClaudeCodeToken(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): string {
  const auth = readClaudeCodeAuth(env);
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
