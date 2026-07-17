import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadMcpToken } from "./auth-store.js";
import {
  extractAuthConfig,
  missingDeclaredMcpEnv,
  readMcpConfigWithSources,
  type McpConfigSource,
  type ServerSpec,
} from "./mount-config.js";
import { serverAccessDecision } from "../settings/mcp-access.js";
import { SettingsSchema, loadSettings } from "../settings/store.js";
import { readTrust, trustMcp } from "../settings/trust.js";

export type McpConnectorHealth = "ready" | "needs_setup" | "blocked" | "disabled" | "error";
export type McpConnectorTrust = "trusted" | "denied" | "pending";
export type McpConnectorAuth = "ready" | "needs_auth" | "not_required";

export type McpConnectorRecord = {
  name: string;
  source: McpConfigSource;
  transport: "stdio" | "http";
  enabled: boolean;
  trust: McpConnectorTrust;
  auth: McpConnectorAuth;
  authMode: "oauth" | "environment" | "none";
  missingEnv: string[];
  health: McpConnectorHealth;
  tools: string[];
  resources: string[];
  lastCheckedAt?: string;
  lastError?: string;
};

const ProbeSchema = z.object({
  health: z.enum(["ready", "error"]),
  tools: z.array(z.string()),
  resources: z.array(z.string()),
  lastCheckedAt: z.string(),
  lastError: z.string().optional(),
});
const RegistryStateSchema = z.object({
  version: z.literal(1),
  servers: z.record(ProbeSchema),
});
type Probe = z.infer<typeof ProbeSchema>;
type RegistryState = z.infer<typeof RegistryStateSchema>;

export type McpReceiptAction = "install" | "import" | "test" | "reconnect" | "enable" | "disable" | "trust" | "auth" | "resource" | "remove";
export type McpConnectorReceipt = {
  version: 1;
  at: string;
  action: McpReceiptAction;
  server?: string;
  outcome: "passed" | "failed";
  detail: string;
};

function statePath(root: string): string {
  return join(root, ".vanta", "mcp", "registry.json");
}

export function mcpReceiptPath(root: string): string {
  return join(root, ".vanta", "mcp", "receipts.jsonl");
}

async function readState(root: string): Promise<RegistryState> {
  try {
    const parsed = RegistryStateSchema.safeParse(JSON.parse(await readFile(statePath(root), "utf8")));
    return parsed.success ? parsed.data : { version: 1, servers: {} };
  } catch {
    return { version: 1, servers: {} };
  }
}

function connectorAuth(spec: ServerSpec, token: Awaited<ReturnType<typeof loadMcpToken>>, env: NodeJS.ProcessEnv) {
  const missingEnv = missingDeclaredMcpEnv(env, spec.env);
  if (missingEnv.length) return { auth: "needs_auth" as const, authMode: "environment" as const, missingEnv };
  if (!extractAuthConfig(spec)) return { auth: "not_required" as const, authMode: "none" as const, missingEnv };
  return { auth: token?.access_token ? "ready" as const : "needs_auth" as const, authMode: "oauth" as const, missingEnv };
}

function connectorHealth(input: {
  enabled: boolean;
  trust: McpConnectorTrust;
  auth: McpConnectorAuth;
  probe?: Probe;
}): McpConnectorHealth {
  if (!input.enabled) return "disabled";
  if (input.trust === "denied") return "blocked";
  if (input.trust === "pending" || input.auth === "needs_auth") return "needs_setup";
  return input.probe?.health ?? "needs_setup";
}

/** Build the canonical project-scoped connector view without starting servers. */
export async function readMcpRegistry(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<McpConnectorRecord[]> {
  const [{ config, sources }, settings, trustState, state] = await Promise.all([
    readMcpConfigWithSources(env, root),
    loadSettings(root, env),
    readTrust(root),
    readState(root),
  ]);
  const records = await Promise.all(Object.entries(config.servers).map(async ([name, spec]) => {
    const enabled = serverAccessDecision(name, settings.mcp ?? {}) === "allow";
    const trustValue = trustState.mcp?.[name];
    const trust: McpConnectorTrust = trustValue === true ? "trusted" : trustValue === false ? "denied" : "pending";
    const authState = connectorAuth(spec, await loadMcpToken(name, env), env);
    const probe = state.servers[name];
    return {
      name,
      source: sources[name] ?? "user",
      transport: spec.url ? "http" : "stdio",
      enabled,
      trust,
      ...authState,
      health: connectorHealth({ enabled, trust, auth: authState.auth, probe }),
      tools: probe?.tools ?? [],
      resources: probe?.resources ?? [],
      lastCheckedAt: probe?.lastCheckedAt,
      lastError: probe?.lastError,
    } satisfies McpConnectorRecord;
  }));
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

/** Persist a credential-free live probe so every host sees the same health view. */
export async function recordMcpProbe(
  root: string,
  name: string,
  result: { ok: boolean; tools?: string[]; resources?: string[]; error?: string },
  now = new Date(),
): Promise<void> {
  const state = await readState(root);
  state.servers[name] = {
    health: result.ok ? "ready" : "error",
    tools: result.tools ?? [],
    resources: result.resources ?? [],
    lastCheckedAt: now.toISOString(),
    lastError: result.error ? redactMcpDetail(result.error) : undefined,
  };
  const path = statePath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** Enable/disable through the existing project-local MCP access policy. */
export async function setMcpConnectorEnabled(root: string, name: string, enabled: boolean): Promise<void> {
  const path = join(root, ".vanta", "settings.local.json");
  const raw = await readLocalSettings(path);
  const current = typeof raw.mcp === "object" && raw.mcp ? raw.mcp as { allow?: string[]; deny?: string[] } : {};
  const next = { ...raw, mcp: nextMcpAccess(current, name, enabled) };
  const parsed = SettingsSchema.safeParse(next);
  if (!parsed.success) throw new Error(`cannot update MCP access: ${parsed.error.issues[0]?.message ?? "invalid settings"}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
}

async function readLocalSettings(path: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; }
  catch { return {}; }
}

function nextMcpAccess(current: { allow?: string[]; deny?: string[] }, name: string, enabled: boolean): { allow?: string[]; deny?: string[] } {
  const deny = new Set((current.deny ?? []).filter(Boolean));
  const allow = new Set((current.allow ?? []).filter(Boolean));
  if (enabled) { deny.delete(name); if (allow.size > 0) allow.add(name); }
  else deny.add(name);
  return {
    ...(allow.size > 0 ? { allow: [...allow].sort() } : {}),
    ...(deny.size > 0 ? { deny: [...deny].sort() } : {}),
  };
}

export async function setMcpConnectorTrust(root: string, name: string, trusted: boolean): Promise<void> {
  await trustMcp(root, name, trusted);
}

export async function appendMcpReceipt(
  root: string,
  receipt: Omit<McpConnectorReceipt, "version" | "at"> & { at?: Date },
): Promise<McpConnectorReceipt> {
  const value: McpConnectorReceipt = {
    version: 1,
    at: (receipt.at ?? new Date()).toISOString(),
    action: receipt.action,
    server: receipt.server,
    outcome: receipt.outcome,
    detail: redactMcpDetail(receipt.detail),
  };
  const path = mcpReceiptPath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  return value;
}

export async function readMcpReceipts(root: string): Promise<McpConnectorReceipt[]> {
  try {
    return (await readFile(mcpReceiptPath(root), "utf8")).split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as McpConnectorReceipt]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

/** Remove bearer/token values and URL query data before durable display. */
export function redactMcpDetail(detail: string): string {
  return detail
    .replace(/(bearer|token|secret|password)([=: ]+)[^\s,;]+/gi, "$1$2[redacted]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s]+/gi, (value) => value.split("?")[0] ?? value);
}
