import { existsSync } from "node:fs";
import { credentialsPath } from "./claude-code-auth.js";
import { defaultCodexAuthPath } from "./codex-auth.js";

// Auth-conflict notice: when an API key AND an OAuth login are both active
// for the same upstream, the user may not realize which credential is in use.
// We surface an informational notice (doctor/status) suggesting they remove one.

export type OAuthPresence = { claude: boolean; codex: boolean };

/** Pure: list credential-conflict notices given env + which OAuth logins exist. */
export function authConflictNotices(env: NodeJS.ProcessEnv, oauth: OAuthPresence): string[] {
  const out: string[] = [];
  if (env.ANTHROPIC_API_KEY?.trim() && oauth.claude) {
    out.push(
      "Anthropic: ANTHROPIC_API_KEY and a Claude OAuth login are both set — remove one to avoid using the wrong credentials (VANTA_PROVIDER=anthropic uses the key; =claude-code uses the OAuth login).",
    );
  }
  if (env.OPENAI_API_KEY?.trim() && oauth.codex) {
    out.push(
      "OpenAI: OPENAI_API_KEY and a Codex OAuth login (~/.codex/auth.json) are both set — remove one (VANTA_PROVIDER=openai uses the key; =codex uses the OAuth login).",
    );
  }
  return out;
}

const safeExists = (p: string): boolean => {
  try { return existsSync(p); } catch { return false; }
};

/** Detect OAuth presence (env tokens or on-disk login files), then list conflicts. Best-effort. */
export function detectAuthConflicts(env: NodeJS.ProcessEnv = process.env): string[] {
  const claude = Boolean(
    env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim() || safeExists(credentialsPath(env)),
  );
  const codex = safeExists(defaultCodexAuthPath(undefined, env));
  return authConflictNotices(env, { claude, codex });
}
