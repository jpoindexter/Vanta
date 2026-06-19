import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { saveMcpToken, type McpToken } from "./auth-store.js";

// OAuth authorization-code flow for an MCP server, shaped like google/auth.ts:
// a one-shot loopback redirect captures the ?code, which is exchanged for a
// token at the server's token endpoint. URL-building and the token-response
// parse are PURE (exported, unit-tested). The token exchange uses an injectable
// fetch so the whole flow is testable without a live server. Errors are returned
// as values — this never throws across the tool boundary.

/** OAuth config carried on an MCP server spec (all from non-secret config). */
export type McpAuthConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
};

/** Defensive parse of a token endpoint's JSON response. */
const TokenResponseSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
  })
  .passthrough();

/** Build the consent URL the user opens. Pure — no IO. */
export function buildMcpAuthUrl(
  cfg: Pick<McpAuthConfig, "authorizationUrl" | "clientId" | "scope">,
  redirectUri: string,
  state: string,
): string {
  const u = new URL(cfg.authorizationUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  if (cfg.scope) u.searchParams.set("scope", cfg.scope);
  return u.toString();
}

/** Map a parsed token endpoint response into the stored token shape. Pure. */
export function tokenFromResponse(json: unknown): McpToken | null {
  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  const { access_token, refresh_token, token_type, expires_in } = parsed.data;
  return {
    access_token,
    refresh_token,
    token_type,
    expiry_date: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

/** Injectable HTTP for the token exchange (real fetch by default → mockable). */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/**
 * Exchange an authorization code for a token at the server's token endpoint.
 * Returns the stored token shape or an error string. Never throws.
 */
export async function exchangeCodeForToken(
  cfg: McpAuthConfig,
  code: string,
  redirectUri: string,
  doFetch: FetchLike,
): Promise<{ ok: true; token: McpToken } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  try {
    const res = await doFetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) return { ok: false, error: `token endpoint returned HTTP ${res.status}` };
    const token = tokenFromResponse(await res.json());
    if (!token) return { ok: false, error: "token endpoint response had no access_token" };
    return { ok: true, token };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Loopback redirect: returns the URI plus a promise resolving with the ?code. */
function awaitLoopbackCode(): Promise<{ redirectUri: string; code: Promise<string> }> {
  return new Promise((resolveServer) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const err = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(err || !got ? `Authorization failed: ${err ?? "no code"}. You can close this tab.` : "Vanta is authorized. You can close this tab.");
      server.close();
      if (err) rejectCode(new Error(`OAuth error: ${err}`));
      else if (got) resolveCode(got);
      else rejectCode(new Error("OAuth redirect missing code"));
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolveServer({ redirectUri: `http://127.0.0.1:${port}`, code });
    });
  });
}

/**
 * Begin an MCP OAuth flow: spin a loopback server, build the consent URL, and
 * complete the token exchange + persist on redirect — all in the background so
 * the caller can surface the URL immediately. Returns the URL to open (or an
 * error). The token/code are never logged.
 */
export async function startMcpAuth(
  server: string,
  cfg: McpAuthConfig,
  env: NodeJS.ProcessEnv,
  doFetch: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<{ ok: true; authUrl: string; done: Promise<void> } | { ok: false; error: string }> {
  const { redirectUri, code } = await awaitLoopbackCode();
  const authUrl = buildMcpAuthUrl(cfg, redirectUri, server);
  const done = code.then(async (c) => {
    const result = await exchangeCodeForToken(cfg, c, redirectUri, doFetch);
    if (!result.ok) throw new Error(result.error);
    await saveMcpToken(server, result.token, env);
  });
  // Swallow background rejection here; the tool reports completion via reconnect.
  done.catch(() => {});
  return { ok: true, authUrl, done };
}
