import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The shared ~/.codex/auth.json store: path resolution, the raw read/write
// primitives, and parsing. Vanta treats the Codex CLI's own auth.json as the
// canonical token store; this module is the file-access seam, kept separate
// from the token-refresh / credential-resolution logic in `codex-auth.ts`.

export type CodexTokens = { access_token: string; refresh_token: string; account_id: string; id_token?: string };

export type ReadFile = (path: string) => string;
export type WriteFile = (path: string, data: string) => void;

export const defaultRead: ReadFile = (p) => readFileSync(p, "utf8");
export const defaultWrite: WriteFile = (p, d) => writeFileSync(p, d, { mode: 0o600 });

/** Path to the Codex CLI auth file (honours CODEX_HOME, like the Codex CLI). */
export function defaultCodexAuthPath(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim() || join(home, ".codex");
  return join(codexHome, "auth.json");
}

export type AuthFile = { auth_mode?: string; tokens?: CodexTokens; last_refresh?: string; [k: string]: unknown };

/** Read + parse ~/.codex/auth.json. Throws an actionable error if absent/garbage. */
export function readCodexAuth(path: string, read: ReadFile = defaultRead): AuthFile {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    throw new Error(`No Codex login found at ${path}. Run \`codex login\` (ChatGPT subscription), then retry.`);
  }
  try {
    return JSON.parse(raw) as AuthFile;
  } catch {
    throw new Error(`Codex auth file at ${path} is not valid JSON. Run \`codex login\` to re-authenticate.`);
  }
}
