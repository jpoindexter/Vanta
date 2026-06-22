import { z } from "zod";
import { parseSkill } from "../skills/frontmatter.js";

// VANTA-MIGRATE — pure parsers for a competitor agent's on-disk store. The source
// tools (OpenClaw, Hermes) follow the de-facto agent conventions Vanta also uses,
// so the contract is: skills as `skills/<slug>/SKILL.md`, MCP servers as a JSON
// `mcpServers` (or `servers`) map, and provider/model in a config JSON. Every
// parser is TOLERANT — an unexpected/partial real tree yields fewer items, never
// a throw — because the live import against a real ~/.openclaw is the boundary
// (these parsers are what the done-criterion fixtures test offline).

export type MigrateSource = "openclaw" | "hermes";
export const MIGRATE_SOURCES: readonly MigrateSource[] = ["openclaw", "hermes"];

/** Where a source tool keeps each footprint, relative to its store root (~/.<tool>). */
export type SourceLayout = {
  skillsDir: string;
  /** Config files to probe, in order, for MCP servers + model config. */
  configFiles: readonly string[];
};

export const SOURCE_LAYOUTS: Record<MigrateSource, SourceLayout> = {
  openclaw: { skillsDir: "skills", configFiles: ["mcp.json", "config.json", "settings.json"] },
  hermes: { skillsDir: "skills", configFiles: ["mcp.json", "config.json", "hermes.json", "settings.json"] },
};

/** A skill found in the source tree, normalized for writeSkill. */
export type ParsedSkill = { name: string; description: string; body: string; tags: string[] };

/** Parse one source SKILL.md into a normalized skill, or null if unusable. Pure. */
export function parseSourceSkill(md: string, fallbackName: string): ParsedSkill | null {
  try {
    const s = parseSkill(md);
    const name = s.meta.name?.trim() || fallbackName;
    const body = s.body.trim();
    if (!name || !body) return null;
    return { name, description: s.meta.description?.trim() || name, body, tags: s.meta.tags ?? [] };
  } catch {
    return null;
  }
}

const ServerShape = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string()).optional(),
  })
  .passthrough();
const McpConfigShape = z
  .object({ servers: z.record(ServerShape).optional(), mcpServers: z.record(ServerShape).optional() })
  .passthrough();

export type McpServer = z.infer<typeof ServerShape>;

/** Extract MCP servers from a config file's text. Accepts `mcpServers` (common)
 *  and `servers` (Vanta). Tolerant: bad JSON / wrong shape → {}. Pure. */
export function parseMcpServers(text: string): Record<string, McpServer> {
  try {
    const parsed = McpConfigShape.safeParse(JSON.parse(text));
    if (!parsed.success) return {};
    return { ...(parsed.data.mcpServers ?? {}), ...(parsed.data.servers ?? {}) };
  } catch {
    return {};
  }
}

export type ModelConfig = { provider?: string; model?: string; apiBaseUrl?: string };

const ModelShape = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    defaultModel: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    baseUrl: z.string().optional(),
    baseURL: z.string().optional(),
  })
  .passthrough();

/** Extract provider/model/base-url from a config file's text. Tolerant. Pure. */
export function parseModelConfig(text: string): ModelConfig {
  try {
    const p = ModelShape.safeParse(JSON.parse(text));
    if (!p.success) return {};
    const d = p.data;
    const out: ModelConfig = {};
    if (d.provider) out.provider = d.provider;
    if (d.model || d.defaultModel) out.model = d.model ?? d.defaultModel;
    const base = d.apiBaseUrl ?? d.baseUrl ?? d.baseURL;
    if (base) out.apiBaseUrl = base;
    return out;
  } catch {
    return {};
  }
}
