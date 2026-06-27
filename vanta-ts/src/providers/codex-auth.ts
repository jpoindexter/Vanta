import {
  defaultRead,
  defaultWrite,
  defaultCodexAuthPath,
  readCodexAuth,
  type ReadFile,
  type WriteFile,
  type AuthFile,
  type CodexTokens,
} from "./codex-auth-file.js";

// The shared ~/.codex/auth.json file-access seam lives in `codex-auth-file.ts`
// (re-exported below so `./codex-auth.js` keeps its public surface).
export { defaultCodexAuthPath, readCodexAuth, type CodexTokens } from "./codex-auth-file.js";

// OAuth for the OpenAI Codex (ChatGPT subscription) backend. Vanta treats the
// Codex CLI's own ~/.codex/auth.json as the shared, canonical token store:
// it reads the access_token, and — only when expiring — refreshes via the
// OpenAI token endpoint and writes the rotated tokens BACK to that file. The
// refresh_token rotates on every refresh, so a private store would invalidate
// the Codex CLI on its next refresh; sharing one lineage keeps both working.
// Verified live 2026-06-02: refresh 200 + rotation, GET /models 200, POST
// /responses 200 (SSE). See DECISIONS.

export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
// The ChatGPT Codex backend. Overridable via `VANTA_CODEX_BASE_URL` so an operator can point codex
// at a proxy / compatible endpoint (and so the provider-hardening recovery path is live-testable
// against a fault-injecting proxy). Read at module load; each `vanta run` is a fresh process.
export const CODEX_BASE_URL = process.env.VANTA_CODEX_BASE_URL?.trim() || "https://chatgpt.com/backend-api/codex";
const REFRESH_SKEW_SECONDS = 300;

export type CodexCreds = { accessToken: string; accountId: string };

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

export type LoadCredsDeps = {
  authPath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  read?: ReadFile;
  write?: WriteFile;
};

type Resolved = {
  path: string;
  read: ReadFile;
  write: WriteFile;
  fetchImpl: typeof fetch;
  nowMs: number;
  nowSec: number;
};

/** Resolve LoadCredsDeps to concrete impls + timestamps (defaults applied). */
function resolveLoadDeps(deps: LoadCredsDeps): Resolved {
  const nowMs = deps.now ? deps.now() : Date.now();
  return {
    path: deps.authPath ?? defaultCodexAuthPath(),
    read: deps.read ?? defaultRead,
    write: deps.write ?? defaultWrite,
    fetchImpl: deps.fetchImpl ?? fetch,
    nowMs,
    nowSec: Math.floor(nowMs / 1000),
  };
}

/** Tokens or an actionable error. */
function requireTokens(auth: AuthFile, path: string): CodexTokens {
  const tokens = auth.tokens;
  if (!tokens?.access_token || !tokens?.refresh_token || !tokens?.account_id) {
    throw new Error(`Codex auth at ${path} is missing tokens. Run \`codex login\` to re-authenticate.`);
  }
  return tokens;
}

/** Refresh, persist the rotated pair back to auth.json, return creds. */
async function refreshAndPersist(auth: AuthFile, tokens: CodexTokens, r: Resolved): Promise<CodexCreds> {
  const refreshed = await refreshCodexTokens(tokens.refresh_token, r.fetchImpl);
  const updated: AuthFile = {
    ...auth,
    tokens: { ...tokens, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token },
    last_refresh: new Date(r.nowMs).toISOString(),
  };
  try {
    r.write(r.path, JSON.stringify(updated, null, 2));
  } catch (err) {
    // NOT a harmless miss: the refresh_token is single-use, so losing the
    // rotated pair bricks the next refresh (401 "already been used") and
    // forces a `codex login`. Token still works for this run — warn loudly.
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`⚠ could not persist rotated Codex tokens to ${r.path}: ${msg} — a future session may need \`codex login\`.\n`);
  }
  return { accessToken: refreshed.access_token, accountId: tokens.account_id };
}

/**
 * Recovery for a refresh 401: "refresh token already used" usually means a
 * concurrent process (the Codex CLI, or another Vanta) won the rotation race
 * and persisted a NEWER token lineage to auth.json. Re-read the file; if its
 * refresh_token differs from the one we burned, adopt that lineage — use its
 * access token directly when fresh, else refresh once with the newer token.
 * Returns null when the file is unchanged (the lineage is genuinely dead).
 */
async function recoverFromRotatedToken(burnedRefreshToken: string, r: Resolved): Promise<CodexCreds | null> {
  let auth: AuthFile;
  try {
    auth = readCodexAuth(r.path, r.read);
  } catch {
    return null;
  }
  const tokens = auth.tokens;
  if (!tokens?.access_token || !tokens?.refresh_token || !tokens?.account_id) return null;
  if (tokens.refresh_token === burnedRefreshToken) return null;
  if (!accessTokenExpiring(tokens.access_token, r.nowSec)) {
    return { accessToken: tokens.access_token, accountId: tokens.account_id };
  }
  try {
    return await refreshAndPersist(auth, tokens, r);
  } catch {
    return null;
  }
}

/**
 * Resolve a usable access token + account id. Refreshes and writes the rotated
 * tokens back to the shared ~/.codex/auth.json only when the token is expiring.
 * A refresh 401 triggers one re-read recovery pass (rotation race, see above).
 */
export async function loadCodexCreds(deps: LoadCredsDeps = {}): Promise<CodexCreds> {
  const r = resolveLoadDeps(deps);
  const auth = readCodexAuth(r.path, r.read);
  const tokens = requireTokens(auth, r.path);
  if (!accessTokenExpiring(tokens.access_token, r.nowSec)) {
    return { accessToken: tokens.access_token, accountId: tokens.account_id };
  }
  try {
    return await refreshAndPersist(auth, tokens, r);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("(401)")) throw err;
    const recovered = await recoverFromRotatedToken(tokens.refresh_token, r);
    if (recovered) return recovered;
    throw err;
  }
}
