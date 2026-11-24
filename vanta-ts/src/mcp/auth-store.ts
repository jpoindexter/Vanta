import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome, ensureVantaStore } from "../store/home.js";

// Per-server OAuth token storage for MCP servers. Mirrors google/auth-store.ts:
// a single 0600 JSON file under <VANTA_HOME>, keyed by server name. The parse is
// pure and exported so the token shape is unit-testable without touching disk.

const TOKEN_FILE = "mcp-auth-tokens.json";

/** Defensive shape — token files are external JSON, never trusted blindly. */
const McpTokenSchema = z
  .object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expiry_date: z.number().optional(),
  })
  .passthrough();

const StoreSchema = z.record(z.string(), McpTokenSchema);

export type McpToken = z.infer<typeof McpTokenSchema>;
export type McpTokenStore = z.infer<typeof StoreSchema>;

function storePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), TOKEN_FILE);
}

/** Defensive parse of an unknown JSON value into the per-server store shape. */
export function parseMcpTokenStore(json: unknown): McpTokenStore {
  const parsed = StoreSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

/** Read the whole store. Missing/corrupt file → empty (never throws). */
export async function loadAllMcpTokens(env: NodeJS.ProcessEnv): Promise<McpTokenStore> {
  const file = storePath(env);
  if (!existsSync(file)) return {};
  try {
    return parseMcpTokenStore(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return {};
  }
}

/** Read one server's token, or null when absent. */
export async function loadMcpToken(server: string, env: NodeJS.ProcessEnv): Promise<McpToken | null> {
  const store = await loadAllMcpTokens(env);
  return store[server] ?? null;
}

/** Unknown expiry remains compatible with legacy stored tokens. */
export function isMcpTokenUsable(token: McpToken | null | undefined, now = Date.now()): boolean {
  return Boolean(token?.access_token && (token.expiry_date === undefined || token.expiry_date > now));
}

export class McpStoredTokenExpiredError extends Error {
  constructor() {
    super("Stored MCP OAuth access token is locally expired; authorization is required before connecting.");
    this.name = "McpStoredTokenExpiredError";
  }
}

/** Fresh launch guard: never substitute a static credential for known-expired OAuth. */
export async function loadMcpTokenForLaunch(server: string, env: NodeJS.ProcessEnv): Promise<McpToken | null> {
  const token = await loadMcpToken(server, env);
  if (token?.access_token && token.expiry_date !== undefined && !isMcpTokenUsable(token)) {
    throw new McpStoredTokenExpiredError();
  }
  return token;
}

/** Persist one server's token, merging into the existing store. 0600 — secret. */
export async function saveMcpToken(server: string, token: McpToken, env: NodeJS.ProcessEnv): Promise<void> {
  await ensureVantaStore(env);
  const store = await loadAllMcpTokens(env);
  store[server] = token;
  // 0o600 — the file holds bearer/refresh tokens (long-lived secrets).
  await writeFile(storePath(env), JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Remove one connector token when its stored configuration is deleted. */
export async function deleteMcpToken(server: string, env: NodeJS.ProcessEnv): Promise<void> {
  const store = await loadAllMcpTokens(env);
  if (!store[server]) return;
  delete store[server];
  await ensureVantaStore(env);
  await writeFile(storePath(env), JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}
