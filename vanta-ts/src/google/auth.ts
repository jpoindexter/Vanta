import { readFile } from "node:fs/promises";
import type { OAuth2Client, Credentials } from "google-auth-library";
import { parseTokenFile, loadClientCreds, loadTokens, saveClientCreds, saveTokens, type StoredTokens } from "./auth-store.js";
import { parseClientJson, publishStateWarning, type ClientCreds } from "./client-json.js";
import { awaitLoopbackCode, awaitCodeViaKernelRelay } from "./auth-callback.js";
export { parseTokenFile } from "./auth-store.js";
export { readApiToken, pollKernelForCode } from "./auth-callback.js";

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

function envClientCreds(env: NodeJS.ProcessEnv): ClientCreds | null {
  const clientId = env.VANTA_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.VANTA_GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const MISSING_CLIENT =
  "Google client credentials missing. One-time setup: download the OAuth client JSON " +
  "(type: Desktop app) from Google Cloud Console and run: vanta auth google --client " +
  "<client_secret.json> (no copy-paste). Or connect Google from Vanta Desktop.";

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
export async function resolveClientCreds(
  clientPath: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<ClientCreds> {
  if (clientPath) {
    const creds = await readClientFile(clientPath);
    await saveClientCreds(creds, env);
    return creds;
  }
  const fromEnv = envClientCreds(env);
  if (fromEnv) return fromEnv;
  const stored = await loadClientCreds(env);
  if (stored) return stored;
  throw new Error(MISSING_CLIENT);
}

export async function hasGoogleClient(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return Boolean(envClientCreds(env) ?? await loadClientCreds(env));
}

export async function buildClient(
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
  clientFactory: typeof buildClient = buildClient,
): Promise<string> {
  const stored = await loadTokens(env);
  if (!stored?.refresh_token) {
    throw new Error("Google not authorized — run: vanta auth google");
  }
  const client = await clientFactory(undefined, await resolveClientCreds(undefined, env));
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
