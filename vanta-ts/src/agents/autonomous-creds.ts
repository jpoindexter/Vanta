import { readClaudeCodeAuth } from "../providers/claude-code-auth.js";

// How a boxed agent authenticates without the host's macOS keychain (which a Linux container can't
// read — the env wall on #2). Resolve an explicit HEADLESS credential and forward it as env. The
// VALUE is only ever passed into the container via `-e NAME` (the value comes from the parent
// process), so the secret never appears in argv / `ps` / logs. Opt-in: null when nothing is set.

export type BoxCredential = { name: string; value: string };
export type AuthReader = (env: NodeJS.ProcessEnv) => { token: string } | null;

/**
 * Order: explicit `ANTHROPIC_API_KEY` → explicit `CLAUDE_CODE_OAUTH_TOKEN` → Vanta's existing
 * claude-code resolver (creds file / keychain) surfaced as a `CLAUDE_CODE_OAUTH_TOKEN`. The auth
 * reader is injected so this is deterministic in tests. Returns null when no credential exists.
 */
export function resolveBoxCredential(env: NodeJS.ProcessEnv, readAuth: AuthReader = readClaudeCodeAuth): BoxCredential | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) return { name: "ANTHROPIC_API_KEY", value: apiKey };
  const oauth = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (oauth) return { name: "CLAUDE_CODE_OAUTH_TOKEN", value: oauth };
  const auth = readAuth(env);
  if (auth?.token) return { name: "CLAUDE_CODE_OAUTH_TOKEN", value: auth.token };
  return null;
}
