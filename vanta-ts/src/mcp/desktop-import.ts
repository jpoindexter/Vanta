import { homedir, platform as osPlatform } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// Import MCP server definitions from Claude Desktop's config into Vanta's MCP
// config. Pure parse + merge: never overwrite an existing Vanta key; report what
// was imported vs skipped. IO is a thin wrapper around the pure core, with the
// filesystem injected so the merge logic is unit-tested without real files.

/** A Claude Desktop MCP server entry. Permissive — Desktop servers are command
 * or url based; we preserve every field verbatim so nothing is lost on import. */
const ServerEntrySchema = z.record(z.unknown());

/** The slice of Claude Desktop config we care about: its `mcpServers` map. */
const DesktopConfigSchema = z.object({
  mcpServers: z.record(ServerEntrySchema).optional(),
  servers: z.record(ServerEntrySchema).optional(),
});

export type DesktopMcpServers = Record<string, Record<string, unknown>>;
export type ParseResult =
  | { ok: true; mcpServers: DesktopMcpServers }
  | { ok: false; error: string };

/**
 * Parse Claude Desktop config text into its `mcpServers` map. Errors-as-values:
 * malformed JSON or a non-conforming shape returns `{ok:false, error}` rather
 * than throwing. A config with no `mcpServers` key parses to an empty map.
 */
export function parseDesktopConfig(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  const parsed = DesktopConfigSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `unexpected config shape: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  }
  return { ok: true, mcpServers: { ...(parsed.data.mcpServers ?? {}), ...(parsed.data.servers ?? {}) } };
}

export type MergeResult = {
  merged: DesktopMcpServers;
  imported: string[];
  skipped: string[];
};

/**
 * Merge incoming Desktop servers into the existing Vanta servers WITHOUT
 * overwriting any existing key. A name already present in `existing` is skipped
 * (reported, not clobbered); a new name is imported. Both lists are returned so
 * the caller can report the outcome. Pure — no IO.
 */
export function mergeMcpServers(
  existing: DesktopMcpServers,
  incoming: DesktopMcpServers,
): MergeResult {
  const merged: DesktopMcpServers = { ...existing };
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const [name, entry] of Object.entries(incoming)) {
    if (Object.prototype.hasOwnProperty.call(existing, name)) {
      skipped.push(name);
      continue;
    }
    merged[name] = entry;
    imported.push(name);
  }
  return { merged, imported, skipped };
}

/**
 * Resolve Claude Desktop's config path for the host platform. Pure: takes the
 * platform string and home dir so it's testable. Returns null on an unsupported
 * platform (Claude Desktop ships macOS + Windows only).
 */
export function desktopConfigPath(platform: NodeJS.Platform, home: string): string | null {
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return null;
}

/** Injected filesystem seam — lets the IO wrapper be tested without real files. */
export type ImportFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: ImportFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => { await mkdir(p, { recursive: true }); },
};

export type ImportOutcome =
  | { ok: true; imported: string[]; skipped: string[]; targetPath: string }
  | { ok: false; error: string };

type ImportOpts = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  fs?: ImportFs;
};

/** Read the existing Vanta config (missing file → empty map). */
async function readVantaServers(path: string, fs: ImportFs): Promise<DesktopMcpServers> {
  const raw = await fs.readFile(path).catch(() => "");
  if (!raw.trim()) return {};
  const parsed = parseDesktopConfig(raw);
  return parsed.ok ? parsed.mcpServers : {};
}

/**
 * Import Claude Desktop's MCP servers into Vanta's `~/.vanta/mcp.json`, merging
 * without overwrite. Missing Desktop config → a clean message (not an error).
 * Errors-as-values throughout. The filesystem is injectable for tests.
 */
export async function importDesktopMcp(opts: ImportOpts = {}): Promise<ImportOutcome> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? osPlatform();
  const home = opts.home ?? homedir();
  const fs = opts.fs ?? realFs;

  const desktopPath = desktopConfigPath(platform, home);
  if (!desktopPath) return { ok: false, error: `Claude Desktop config not supported on platform "${platform}"` };

  const desktopRaw = await fs.readFile(desktopPath).catch(() => null);
  if (desktopRaw === null) {
    return { ok: false, error: `no Claude Desktop config found at ${desktopPath}` };
  }
  const parsed = parseDesktopConfig(desktopRaw);
  if (!parsed.ok) return { ok: false, error: `${desktopPath}: ${parsed.error}` };

  const vantaHome = resolveVantaHome(env);
  const targetPath = join(vantaHome, "mcp.json");
  const existing = await readVantaServers(targetPath, fs);

  const { merged, imported, skipped } = mergeMcpServers(existing, parsed.mcpServers);
  if (imported.length > 0) {
    await fs.mkdir(vantaHome);
    await fs.writeFile(targetPath, JSON.stringify({ mcpServers: merged }, null, 2) + "\n");
  }
  return { ok: true, imported, skipped, targetPath };
}
