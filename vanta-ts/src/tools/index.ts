import { InMemoryToolRegistry } from "./registry.js";
import type { ToolRegistry } from "./registry.js";
import { ALL_TOOLS } from "./all-tools.js";
import { buildToolSearchTool } from "./tool-search.js";
import { buildMountMcpTool } from "./mount-mcp.js";
import { buildMcpAuthTool } from "./mcp-auth.js";
import { buildRunPipelineTool } from "./run-pipeline.js";

/**
 * Build the tool registry. With no args it registers every tool. Pass
 * `exclude` to omit tools by `schema.name` — a subagent excludes `delegate` so
 * it cannot recursively spawn further workers.
 * `mount_mcp`/`mcp_auth` are registered via factory (need the live registry ref).
 */
export function buildRegistry(opts?: { exclude?: string[]; include?: string[] }): ToolRegistry {
  const exclude = new Set(opts?.exclude ?? []);
  const include = opts?.include ? new Set(opts.include) : null;
  const registry = new InMemoryToolRegistry(include ?? undefined);
  const allowed = (name: string): boolean => !exclude.has(name) && (!include || include.has(name));
  for (const tool of ALL_TOOLS) {
    if (allowed(tool.schema.name)) registry.register(tool);
  }
  if (allowed("mount_mcp")) {
    registry.register(buildMountMcpTool(registry));
  }
  if (allowed("mcp_auth")) {
    registry.register(buildMcpAuthTool(registry));
  }
  if (allowed("tool_search")) {
    registry.register(buildToolSearchTool(registry));
  }
  if (allowed("run_pipeline")) {
    registry.register(buildRunPipelineTool(registry));
  }
  return registry;
}

export { InMemoryToolRegistry, ToolRegistry } from "./registry.js";
