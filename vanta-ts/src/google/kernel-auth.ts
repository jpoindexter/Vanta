import { buildClient, pollKernelForCode, readApiToken, resolveClientCreds } from "./auth.js";
import { parseTokenFile, saveTokens } from "./auth-store.js";

export type GoogleAuthStart = { authUrl: string };

export function googleKernelBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788").replace(/\/$/, "");
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

export async function beginGoogleKernelAuth(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleAuthStart> {
  const base = googleKernelBase(env);
  const creds = await resolveClientCreds(undefined, env);
  const redirectUri = `${base}/oauth/callback`;
  const client = await buildClient(redirectUri, creds);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    redirect_uri: redirectUri,
  });
  const token = await readApiToken(env);
  if (token) {
    await fetchImpl(`${base}/api/oauth/poll`, { headers: { "X-Vanta-Token": token } }).catch(() => null);
  }
  return { authUrl };
}

export async function completeGoogleKernelAuth(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const base = googleKernelBase(env);
  const apiToken = await readApiToken(env);
  if (!apiToken) throw new Error("Kernel API token not found — run `vanta doctor` to check kernel health.");
  const code = await pollKernelForCode(base, apiToken);
  const client = await buildClient(`${base}/oauth/callback`, await resolveClientCreds(undefined, env));
  const { tokens } = await client.getToken(code);
  const parsed = parseTokenFile(tokens as unknown);
  if (!parsed?.refresh_token) {
    throw new Error("Google did not return a refresh_token. Revoke Vanta access, then start Google authorization again.");
  }
  await saveTokens(parsed, env);
}
