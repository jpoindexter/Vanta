import { createServer } from "node:http";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { AddressInfo } from "node:net";
import type { OAuth2Client, Credentials } from "google-auth-library";
import { resolveVantaHome, ensureVantaStore } from "../store/home.js";

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

const TOKEN_FILE = "google-tokens.json";

/** Defensive shape — token files are external JSON, never trusted blindly. */
const TokenSchema = z
  .object({
    refresh_token: z.string().optional(),
    access_token: z.string().optional(),
    expiry_date: z.number().optional(),
  })
  .passthrough();

type StoredTokens = z.infer<typeof TokenSchema>;

function tokenPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), TOKEN_FILE);
}

/**
 * Defensive parse of an unknown JSON value into the token shape. Returns null
 * for anything that isn't an object with the expected (optional) fields.
 */
export function parseTokenFile(json: unknown): StoredTokens | null {
  const parsed = TokenSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

async function loadTokens(
  env: NodeJS.ProcessEnv,
): Promise<StoredTokens | null> {
  const file = tokenPath(env);
  if (!existsSync(file)) return null;
  try {
    return parseTokenFile(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null; // corrupt/unreadable token file is treated as "not authorized"
  }
}

async function saveTokens(
  tokens: StoredTokens,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await ensureVantaStore(env);
  // 0o600 — the file holds a refresh_token (a long-lived secret).
  await writeFile(tokenPath(env), JSON.stringify(tokens, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readClientCreds(env: NodeJS.ProcessEnv): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = env.VANTA_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.VANTA_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google client credentials missing. One-time setup: create an OAuth " +
        "client (type: Desktop app) in Google Cloud Console, then set " +
        "VANTA_GOOGLE_CLIENT_ID and VANTA_GOOGLE_CLIENT_SECRET in your env.",
    );
  }
  return { clientId, clientSecret };
}

async function buildClient(
  redirectUri: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<OAuth2Client> {
  const { clientId, clientSecret } = readClientCreds(env);
  const { OAuth2Client } = await import("google-auth-library");
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

/**
 * Start a one-shot loopback server, return its base URL plus a promise that
 * resolves with the OAuth ?code (or rejects on ?error). Closes after one hit.
 */
function awaitLoopbackCode(): Promise<{
  redirectUri: string;
  code: Promise<string>;
}> {
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

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolveServer({ redirectUri: `http://127.0.0.1:${port}`, code });
    });
  });
}

/**
 * Interactive one-time consent. Spins a loopback redirect server, prints the
 * consent URL for the user to open, captures the code, exchanges it for tokens
 * (including a refresh_token), and persists them.
 */
export async function runGoogleAuth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Fail on missing creds before opening a listener, so we never orphan a server.
  readClientCreds(env);
  const { redirectUri, code } = await awaitLoopbackCode();
  const client = await buildClient(redirectUri, env);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    redirect_uri: redirectUri,
  });
  // eslint-disable-next-line no-console -- interactive CLI consent step
  console.log(`\nOpen this URL to authorize Vanta with Google:\n\n${authUrl}\n`);

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
  const client = await buildClient(undefined, env);
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
