import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { OAuth2Client, Credentials } from "google-auth-library";
import { parseTokenFile, loadTokens, saveTokens, type StoredTokens } from "./auth-store.js";
import { parseClientJson, publishStateWarning, type ClientCreds } from "./client-json.js";
export { parseTokenFile } from "./auth-store.js";

/**
 * One-time Google OAuth (loopback redirect consent) and token persistence.
 * Tokens live at <VANTA_HOME>/google-tokens.json and carry the refresh_token so
 * getAccessToken can mint fresh access tokens forever without re-consent.
 */

/** All scopes the gmail/calendar/drive tools need, requested once up front. */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

function readClientCreds(env: NodeJS.ProcessEnv): ClientCreds {
  const clientId = env.VANTA_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.VANTA_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google client credentials missing. One-time setup: download the OAuth " +
        "client JSON (type: Desktop app) from Google Cloud Console and run: " +
        "vanta auth google --client <client_secret.json> (no copy-paste). " +
        "Or set VANTA_GOOGLE_CLIENT_ID and VANTA_GOOGLE_CLIENT_SECRET in your env.",
    );
  }
  return { clientId, clientSecret };
}

/**
 * Read + parse Google's downloaded client_secret.json. Throws an actionable
 * error (never the secret) on a missing/malformed file.
 */
async function readClientFile(path: string): Promise<ClientCreds> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(
      `Could not read client JSON at ${path}. Download it from Google Cloud ` +
        "Console → APIs & Services → Credentials → your OAuth client → Download JSON.",
    );
  }
  const parsed = parseClientJson(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.creds;
}

/** Creds from a --client file when given, else from env. */
async function resolveClientCreds(
  clientPath: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<ClientCreds> {
  return clientPath ? readClientFile(clientPath) : readClientCreds(env);
}

async function buildClient(
  redirectUri: string | undefined,
  creds: ClientCreds,
): Promise<OAuth2Client> {
  const { OAuth2Client } = await import("google-auth-library");
  return new OAuth2Client({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri,
  });
}

/**
 * Start a one-shot loopback server, return its base URL plus a promise that
 * resolves with the OAuth ?code (or rejects on ?error). Closes after one hit.
 * Rejects with an actionable message if the sandbox blocks localhost TCP binding.
 */
function awaitLoopbackCode(): Promise<{
  redirectUri: string;
  code: Promise<string>;
}> {
  return new Promise((resolveServer, rejectServer) => {
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
      res.end(
        err || !got
          ? `Authorization failed: ${err ?? "no code"}. You can close this tab.`
          : "Vanta is authorized. You can close this tab.",
      );
      server.close();
      if (err) rejectCode(new Error(`OAuth error: ${err}`));
      else if (got) resolveCode(got);
      else rejectCode(new Error("OAuth redirect missing code"));
    });

    server.once("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "EPERM" || nodeErr.code === "EACCES") {
        // Signal to runGoogleAuth to try the kernel-relay fallback.
        const blocked = new Error("loopback-blocked") as NodeJS.ErrnoException;
        blocked.code = "LOOPBACK_BLOCKED";
        rejectServer(blocked);
      } else {
        rejectServer(err);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      const port = (server.address() as AddressInfo).port;
      resolveServer({ redirectUri: `http://127.0.0.1:${port}`, code });
    });
  });
}

// ---------------------------------------------------------------------------
// Kernel-relay OAuth fallback: when localhost TCP listen is blocked (sandbox),
// route the callback through the Vanta kernel's HTTP server (already running
// on port 7788 outside the sandbox). The browser redirects to
// http://127.0.0.1:7788/oauth/callback?code=... and the kernel stores the
// code; the agent polls /api/oauth/poll (token-gated) until it arrives.
// ---------------------------------------------------------------------------

async function readApiToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  const { resolveVantaHome } = await import("../store/home.js");
  return readFile(join(resolveVantaHome(env), "api-token"), "utf8")
    .then((t) => t.trim())
    .catch(() => null);
}

async function pollKernelForCode(kernelUrl: string, apiToken: string): Promise<string> {
  for (let i = 0; i < 150; i++) {
    await new Promise<void>((r) => setTimeout(r, 2000));
    const res = await fetch(`${kernelUrl}/api/oauth/poll`, {
      headers: { "X-Vanta-Token": apiToken },
    }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) continue;
    if (typeof data.error === "string") throw new Error(`OAuth error: ${data.error}`);
    if (typeof data.code === "string") return data.code;
  }
  throw new Error("Google OAuth timed out waiting for authorization (5 min limit).");
}

async function awaitCodeViaKernelRelay(
  env: NodeJS.ProcessEnv,
  notify: (msg: string) => void,
): Promise<{ redirectUri: string; code: Promise<string> }> {
  const kernelUrl = (env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788").replace(/\/$/, "");
  const apiToken = await readApiToken(env);
  if (!apiToken) {
    throw new Error(
      "Loopback server blocked and kernel API token not found — run `vanta doctor`.\n" +
      "Or run `./run.sh auth google` in a regular terminal.",
    );
  }
  const status = await fetch(`${kernelUrl}/api/status`).catch(() => null);
  if (!status?.ok) {
    throw new Error(
      `Loopback server blocked and kernel not reachable at ${kernelUrl}.\n` +
      "Start it with `cargo run -- serve` or `./run.sh`, then retry.",
    );
  }
  notify("\n(Loopback blocked — routing callback through the kernel on port 7788)\n");
  const redirectUri = `${kernelUrl}/oauth/callback`;
  const code = pollKernelForCode(kernelUrl, apiToken);
  return { redirectUri, code };
}

/**
 * Interactive one-time consent. Spins a loopback redirect server, prints the
 * consent URL for the user to open, captures the code, exchanges it for tokens
 * (including a refresh_token), and persists them.
 */
export interface GoogleAuthOptions {
  /** Path to Google's downloaded client_secret.json (ingest, no copy-paste). */
  clientPath?: string;
  /** Sink for the 7-day-expiry guidance (defaults to console.log). */
  notify?: (msg: string) => void;
}

export async function runGoogleAuth(
  env: NodeJS.ProcessEnv = process.env,
  opts: GoogleAuthOptions = {},
): Promise<void> {
  // eslint-disable-next-line no-console -- interactive CLI consent step
  const notify = opts.notify ?? ((m: string) => console.log(m));
  // Fail on missing/bad creds before opening a listener, so we never orphan a server.
  const creds = await resolveClientCreds(opts.clientPath, env);
  // Best-effort: client_secret.json carries no publishing-status field, so the
  // safe default ("unknown") surfaces the 7-day Testing-token warning + guidance.
  const warning = publishStateWarning("unknown");
  if (warning) notify(`\n${warning}\n`);

  // Try the loopback server first; fall back to the kernel relay when blocked.
  let redirectUri: string;
  let code: Promise<string>;
  try {
    ({ redirectUri, code } = await awaitLoopbackCode());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "LOOPBACK_BLOCKED") throw err;
    ({ redirectUri, code } = await awaitCodeViaKernelRelay(env, notify));
  }

  const client = await buildClient(redirectUri, creds);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    redirect_uri: redirectUri,
  });
  notify(`\nOpen this URL to authorize Vanta with Google:\n\n${authUrl}\n`);

  const { tokens } = await client.getToken(await code);
  const parsed = parseTokenFile(tokens as unknown);
  if (!parsed?.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Revoke Vanta's access at " +
        "myaccount.google.com/permissions and run: vanta auth google",
    );
  }
  await saveTokens(parsed, env);
}

/**
 * Load stored tokens, refresh via the stored refresh_token, persist any updated
 * credentials, and return a valid access token. Throws an actionable error when
 * the user has not yet authorized.
 */
export async function getAccessToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const stored = await loadTokens(env);
  if (!stored?.refresh_token) {
    throw new Error("Google not authorized — run: vanta auth google");
  }
  const client = await buildClient(undefined, readClientCreds(env));
  client.setCredentials({ refresh_token: stored.refresh_token });

  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Google token refresh failed — run: vanta auth google");
  }
  // getAccessToken() mutates client.credentials with the fresh access_token +
  // expiry_date; persist the merged set so the refresh_token is never lost.
  await saveTokens(mergeCredentials(stored, client.credentials), env);
  return token;
}

/** Keep the refresh_token even when a refresh response omits it. */
function mergeCredentials(
  stored: StoredTokens,
  fresh: Credentials,
): StoredTokens {
  return {
    refresh_token: fresh.refresh_token ?? stored.refresh_token,
    access_token: fresh.access_token ?? stored.access_token,
    expiry_date: fresh.expiry_date ?? stored.expiry_date,
  };
}

/** True when a token file exists and parses with a usable refresh_token. */
export async function hasGoogleAuth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const stored = await loadTokens(env);
  return Boolean(stored?.refresh_token);
}
