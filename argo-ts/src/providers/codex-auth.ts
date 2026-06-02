import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// OAuth for the OpenAI Codex (ChatGPT subscription) backend. Argo treats the
// Codex CLI's own ~/.codex/auth.json as the shared, canonical token store:
// it reads the access_token, and — only when expiring — refreshes via the
// OpenAI token endpoint and writes the rotated tokens BACK to that file. The
// refresh_token rotates on every refresh, so a private store would invalidate
// the Codex CLI on its next refresh; sharing one lineage keeps both working.
// Verified live 2026-06-02: refresh 200 + rotation, GET /models 200, POST
// /responses 200 (SSE). See DECISIONS.

export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const REFRESH_SKEW_SECONDS = 300;

export type CodexTokens = { access_token: string; refresh_token: string; account_id: string; id_token?: string };
export type CodexCreds = { accessToken: string; accountId: string };

type ReadFile = (path: string) => string;
type WriteFile = (path: string, data: string) => void;

const defaultRead: ReadFile = (p) => readFileSync(p, "utf8");
const defaultWrite: WriteFile = (p, d) => writeFileSync(p, d, { mode: 0o600 });

/** Path to the Codex CLI auth file (honours CODEX_HOME, like the Codex CLI). */
export function defaultCodexAuthPath(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim() || join(home, ".codex");
  return join(codexHome, "auth.json");
}

/** Decode a JWT's `exp` claim (seconds since epoch). Null if unparseable. */
export function jwtExp(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const exp = (JSON.parse(Buffer.from(part, "base64").toString("utf8")) as { exp?: number }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** True when the access token is within `skew` of expiry (or can't be read). */
export function accessTokenExpiring(token: string, nowSec: number, skew = REFRESH_SKEW_SECONDS): boolean {
  const exp = jwtExp(token);
  return exp === null || exp - skew <= nowSec;
}

/** POST the refresh-token grant. Returns the new token pair (refresh_token rotates). */
export async function refreshCodexTokens(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ access_token: string; refresh_token: string }> {
  if (!refreshToken) throw new Error("Codex auth has no refresh_token. Run `codex login` to re-authenticate.");
  const res = await fetchImpl(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CODEX_CLIENT_ID }),
  });
  if (res.status === 429) {
    throw new Error("Codex token refresh rate-limited (429). Credentials are still valid; retry after the limit resets.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Codex token refresh failed (${res.status}). Run \`codex login\` to re-authenticate. ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!json.access_token) throw new Error("Codex token refresh returned no access_token.");
  return { access_token: json.access_token, refresh_token: json.refresh_token || refreshToken };
}

type AuthFile = { auth_mode?: string; tokens?: CodexTokens; last_refresh?: string; [k: string]: unknown };

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

export type LoadCredsDeps = {
  authPath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  read?: ReadFile;
  write?: WriteFile;
};

/**
 * Resolve a usable access token + account id. Refreshes and writes the rotated
 * tokens back to the shared ~/.codex/auth.json only when the token is expiring.
 */
export async function loadCodexCreds(deps: LoadCredsDeps = {}): Promise<CodexCreds> {
  const path = deps.authPath ?? defaultCodexAuthPath();
  const read = deps.read ?? defaultRead;
  const write = deps.write ?? defaultWrite;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowMs = deps.now ? deps.now() : Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  const auth = readCodexAuth(path, read);
  const tokens = auth.tokens;
  if (!tokens?.access_token || !tokens?.refresh_token || !tokens?.account_id) {
    throw new Error(`Codex auth at ${path} is missing tokens. Run \`codex login\` to re-authenticate.`);
  }
  if (!accessTokenExpiring(tokens.access_token, nowSec)) {
    return { accessToken: tokens.access_token, accountId: tokens.account_id };
  }
  const refreshed = await refreshCodexTokens(tokens.refresh_token, fetchImpl);
  const updated: AuthFile = {
    ...auth,
    tokens: { ...tokens, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token },
    last_refresh: new Date(nowMs).toISOString(),
  };
  try {
    write(path, JSON.stringify(updated, null, 2));
  } catch {
    // Best-effort persist; the token still works for this run even if write fails.
  }
  return { accessToken: refreshed.access_token, accountId: tokens.account_id };
}
