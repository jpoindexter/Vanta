import type http from "node:http";
import { hasGoogleAuth, hasGoogleClient, resolveClientCreds } from "../google/auth.js";
import { beginGoogleKernelAuth, completeGoogleKernelAuth } from "../google/kernel-auth.js";
import { readJson, sendJson } from "./handlers.js";

export type GoogleConnectStatus = {
  status: "ready" | "needs_setup";
  clientConfigured: boolean;
  authorized: boolean;
  message: string;
  authUrl?: string;
};

type GoogleConnectDeps = {
  hasClient: (env: NodeJS.ProcessEnv) => Promise<boolean>;
  hasAuth: (env: NodeJS.ProcessEnv) => Promise<boolean>;
  ingestClient: (path: string, env: NodeJS.ProcessEnv) => Promise<unknown>;
  begin: (env: NodeJS.ProcessEnv) => Promise<{ authUrl: string }>;
  complete: (env: NodeJS.ProcessEnv) => Promise<void>;
};

const defaultDeps: GoogleConnectDeps = {
  hasClient: hasGoogleClient,
  hasAuth: hasGoogleAuth,
  ingestClient: (path, env) => resolveClientCreds(path, env),
  begin: (env) => beginGoogleKernelAuth(env),
  complete: completeGoogleKernelAuth,
};

export async function googleConnectStatus(
  env: NodeJS.ProcessEnv = process.env,
  deps: GoogleConnectDeps = defaultDeps,
): Promise<GoogleConnectStatus> {
  const [clientConfigured, authorized] = await Promise.all([
    deps.hasClient(env),
    deps.hasAuth(env),
  ]);
  const message = !clientConfigured
    ? "Add the Google Desktop app client JSON once. Vanta stores it privately for future refreshes."
    : !authorized
      ? "Client saved. Complete Google consent to use Gmail, Calendar, and Drive."
      : "Google Workspace is connected for Gmail, Calendar, and Drive.";
  return {
    status: clientConfigured && authorized ? "ready" : "needs_setup",
    clientConfigured,
    authorized,
    message,
  };
}

export async function performGoogleConnectAction(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
  deps: GoogleConnectDeps = defaultDeps,
): Promise<GoogleConnectStatus> {
  const body = input as { action?: unknown; clientPath?: unknown };
  if (body.action === "ingest_client") {
    if (typeof body.clientPath !== "string" || !body.clientPath.trim()) {
      throw new Error("Choose the downloaded Google client_secret.json file.");
    }
    await deps.ingestClient(body.clientPath.trim(), env);
    return googleConnectStatus(env, deps);
  }
  if (body.action === "start") {
    const current = await googleConnectStatus(env, deps);
    if (!current.clientConfigured) throw new Error("Add the Google client JSON before starting consent.");
    const { authUrl } = await deps.begin(env);
    return { ...current, authUrl, message: "Consent is ready. Open Google, approve access, then finish the connection." };
  }
  if (body.action === "complete") {
    await deps.complete(env);
    return googleConnectStatus(env, deps);
  }
  throw new Error("action must be ingest_client, start, or complete");
}

function publicGoogleError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(client_secret|refresh_token|access_token|code)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/\b(?:ya29\.|1\/\/)[A-Za-z0-9._-]+\b/g, "[redacted]");
}

export async function handleGoogleConnectStatus(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await googleConnectStatus());
}

export async function handleGoogleConnectAction(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    sendJson(res, 200, await performGoogleConnectAction(await readJson(req)));
  } catch (error) {
    sendJson(res, 400, { error: publicGoogleError(error) });
  }
}
