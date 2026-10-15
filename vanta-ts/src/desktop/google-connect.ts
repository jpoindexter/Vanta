import type http from "node:http";
import { hasGoogleAuth, hasGoogleClient, resolveClientCreds } from "../google/auth.js";
import { beginGoogleKernelAuth, completeGoogleKernelAuth } from "../google/kernel-auth.js";
import { readJson, sendJson } from "./handlers.js";
import { GOOGLE_SERVICES, isGoogleService, type GoogleService } from "../google/capability.js";

export type GoogleConnectStatus = {
  status: "ready" | "needs_setup";
  clientConfigured: boolean;
  authorized: boolean;
  authorizedServices: GoogleService[];
  missingServices: GoogleService[];
  message: string;
  authUrl?: string;
};

type GoogleConnectDeps = {
  hasClient: (env: NodeJS.ProcessEnv) => Promise<boolean>;
  hasAuth: (env: NodeJS.ProcessEnv, service: GoogleService) => Promise<boolean>;
  ingestClient: (path: string, env: NodeJS.ProcessEnv) => Promise<unknown>;
  begin: (env: NodeJS.ProcessEnv, service: GoogleService) => Promise<{ authUrl: string }>;
  complete: (env: NodeJS.ProcessEnv, service: GoogleService) => Promise<void>;
};

const defaultDeps: GoogleConnectDeps = {
  hasClient: hasGoogleClient,
  hasAuth: hasGoogleAuth,
  ingestClient: (path, env) => resolveClientCreds(path, env),
  begin: (env, service) => beginGoogleKernelAuth(env, fetch, service),
  complete: (env, service) => completeGoogleKernelAuth(env, service),
};

export async function googleConnectStatus(
  env: NodeJS.ProcessEnv = process.env,
  deps: GoogleConnectDeps = defaultDeps,
): Promise<GoogleConnectStatus> {
  const [clientConfigured, ...serviceAuth] = await Promise.all([
    deps.hasClient(env),
    ...GOOGLE_SERVICES.map((service) => deps.hasAuth(env, service)),
  ]);
  const authorizedServices = GOOGLE_SERVICES.filter((_, index) => serviceAuth[index]);
  const missingServices = GOOGLE_SERVICES.filter((service) => !authorizedServices.includes(service));
  const authorized = authorizedServices.length > 0;
  const message = !clientConfigured
    ? "Add the Google Desktop app client JSON once. Vanta stores it privately for future refreshes."
    : !authorized
      ? "Client saved. Authorize Gmail, Calendar, or Drive separately."
      : missingServices.length
        ? `Connected: ${authorizedServices.join(", ")}. Still separate: ${missingServices.join(", ")}.`
        : "Google Workspace capabilities are connected with separate Gmail, Calendar, and Drive grants.";
  return {
    status: clientConfigured && authorized ? "ready" : "needs_setup",
    clientConfigured,
    authorized,
    authorizedServices,
    missingServices,
    message,
  };
}

export async function performGoogleConnectAction(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
  deps: GoogleConnectDeps = defaultDeps,
): Promise<GoogleConnectStatus> {
  const body = input as { action?: unknown; clientPath?: unknown; service?: unknown };
  const service = body.service === undefined ? "gmail" : body.service;
  if (body.action !== "ingest_client" && !isGoogleService(service)) {
    throw new Error("service must be gmail, calendar, or drive");
  }
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
    const { authUrl } = await deps.begin(env, service as GoogleService);
    return { ...current, authUrl, message: `${service} consent is ready. Approve only that capability, then finish the connection.` };
  }
  if (body.action === "complete") {
    await deps.complete(env, service as GoogleService);
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
