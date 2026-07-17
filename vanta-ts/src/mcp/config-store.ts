import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { buildInstallSpec, catalogEntry } from "./catalog.js";
import { readMcpConfigWithSources, type McpConfigSource } from "./mount-config.js";

type JsonConfig = Record<string, unknown> & {
  servers?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
};

export type McpConfigMutation =
  | { ok: true; name: string; path: string; detail: string }
  | { ok: false; error: string };

export async function installCatalogMcp(
  name: string,
  withTools: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<McpConfigMutation> {
  const entry = catalogEntry(name);
  if (!entry) return { ok: false, error: `unknown MCP connector "${name}"` };
  const built = buildInstallSpec(entry, withTools);
  if (!built.ok) return built;
  const path = join(resolveVantaHome(env), "mcp.json");
  const raw = await readJsonConfig(path);
  const servers = { ...(raw.mcpServers ?? {}), ...(raw.servers ?? {}), [name]: built.spec };
  await writeJsonConfig(path, { ...raw, mcpServers: undefined, servers });
  return { ok: true, name, path, detail: `${built.toolCount} read-mostly tools` };
}

export async function removeStoredMcp(
  root: string,
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<McpConfigMutation> {
  const { sources } = await readMcpConfigWithSources(env, root);
  const source = sources[name];
  if (!source) return { ok: false, error: `MCP connector "${name}" is not configured` };
  if (source === "environment") return { ok: false, error: "environment connectors must be removed from VANTA_MCP_SERVERS" };
  const path = configPath(root, env, source);
  const raw = await readJsonConfig(path);
  const next = withoutServer(raw, name);
  await writeJsonConfig(path, next);
  return { ok: true, name, path, detail: `removed ${source} connector configuration` };
}

function configPath(root: string, env: NodeJS.ProcessEnv, source: McpConfigSource): string {
  return source === "project" ? join(root, ".mcp.json") : join(resolveVantaHome(env), "mcp.json");
}

function withoutServer(raw: JsonConfig, name: string): JsonConfig {
  const servers = { ...(raw.servers ?? {}) };
  const mcpServers = { ...(raw.mcpServers ?? {}) };
  delete servers[name];
  delete mcpServers[name];
  return {
    ...raw,
    ...(raw.servers ? { servers } : {}),
    ...(raw.mcpServers ? { mcpServers } : {}),
  };
}

async function readJsonConfig(path: string): Promise<JsonConfig> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonConfig : {};
  } catch {
    return {};
  }
}

async function writeJsonConfig(path: string, value: JsonConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const cleaned = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  await writeFile(path, `${JSON.stringify(cleaned, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
