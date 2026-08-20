import {
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_SCOPES,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  LinkedInIdentitySchema,
  LinkedInTokenResponseSchema,
  type LinkedInCredential,
  type LinkedInFetch,
  type LinkedInIdentity,
} from "./contract.js";
import { startLinkedInCallback } from "./callback.js";
import { openExternalUrl } from "./open-url.js";
import { createOAuthState, createPkcePair } from "./pkce.js";
import { loadLinkedInCredential, saveLinkedInCredential } from "./store.js";

export interface LinkedInAuthOptions {
  clientId?: string;
  notify?: (message: string) => void;
  fetch?: LinkedInFetch;
  openUrl?: (url: string) => Promise<void>;
  now?: () => number;
}

interface TokenExchangeInput {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export function buildLinkedInAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(LINKEDIN_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeLinkedInCode(
  input: TokenExchangeInput,
  doFetch: LinkedInFetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });
  const response = await doFetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`LinkedIn token exchange failed with HTTP ${response.status}.`);
  const parsed = LinkedInTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("LinkedIn token response did not include a valid access token.");
  return { accessToken: parsed.data.access_token, expiresIn: parsed.data.expires_in };
}

export async function fetchLinkedInIdentity(
  accessToken: string,
  doFetch: LinkedInFetch,
): Promise<LinkedInIdentity> {
  const response = await doFetch(LINKEDIN_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`LinkedIn identity verification failed with HTTP ${response.status}.`);
  const parsed = LinkedInIdentitySchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("LinkedIn identity response was missing the member identifier.");
  return parsed.data;
}

async function resolveClientId(
  env: NodeJS.ProcessEnv,
  explicit: string | undefined,
): Promise<string> {
  const stored = await loadLinkedInCredential(env);
  const clientId = explicit?.trim() || env.VANTA_LINKEDIN_CLIENT_ID?.trim() || stored?.clientId;
  if (!clientId) {
    throw new Error("LinkedIn client ID missing. Run: vanta auth linkedin --client-id <client-id>");
  }
  return clientId;
}

export async function runLinkedInAuth(
  env: NodeJS.ProcessEnv = process.env,
  options: LinkedInAuthOptions = {},
): Promise<LinkedInIdentity> {
  const notify = options.notify ?? ((message: string) => console.log(message));
  const doFetch = options.fetch ?? (globalThis.fetch as LinkedInFetch);
  const clientId = await resolveClientId(env, options.clientId);
  const state = createOAuthState();
  const pkce = createPkcePair();
  const callback = await startLinkedInCallback(state);
  const authUrl = buildLinkedInAuthUrl({
    clientId,
    redirectUri: callback.redirectUri,
    state,
    codeChallenge: pkce.challenge,
  });
  notify(`\nAuthorize Vanta in your default browser. If it does not open, use:\n\n${authUrl}\n`);
  await (options.openUrl ?? openExternalUrl)(authUrl).catch(() => {
    notify("The browser could not be opened automatically; open the URL above manually.");
  });
  try {
    const token = await exchangeLinkedInCode({
      clientId,
      code: await callback.code,
      codeVerifier: pkce.verifier,
      redirectUri: callback.redirectUri,
    }, doFetch);
    const identity = await fetchLinkedInIdentity(token.accessToken, doFetch);
    const now = options.now?.() ?? Date.now();
    const credential: LinkedInCredential = {
      accessToken: token.accessToken,
      clientId,
      expiresAt: now + token.expiresIn * 1000,
      scopes: [...LINKEDIN_SCOPES],
      subject: identity.sub,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: identity.email } : {}),
    };
    await saveLinkedInCredential(credential, env);
    return identity;
  } finally {
    await callback.close();
  }
}

export async function linkedInStatus(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<{ connected: boolean; expired: boolean; credential: LinkedInCredential | null }> {
  const credential = await loadLinkedInCredential(env);
  if (!credential) return { connected: false, expired: false, credential: null };
  const expired = credential.expiresAt <= now;
  return { connected: !expired, expired, credential };
}

export async function getLinkedInAccessToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const status = await linkedInStatus(env);
  if (!status.credential || status.expired) {
    throw new Error("LinkedIn authorization is missing or expired. Run: vanta auth linkedin");
  }
  return status.credential.accessToken;
}
