import { ToolRegistry } from "./registry.js";
import { ALL_TOOLS } from "./all-tools.js";
import { buildToolSearchTool } from "./tool-search.js";
import { buildMountMcpTool } from "./mount-mcp.js";

/**
 * Build the tool registry. With no args it registers every tool. Pass
 * `exclude` to omit tools by `schema.name` — a subagent excludes `delegate` so
 * it cannot recursively spawn further workers.
 * `mount_mcp` is registered via factory (needs a reference to the live registry).
 */
export function buildRegistry(opts?: { exclude?: string[] }): ToolRegistry {
  const registry = new ToolRegistry();
  const exclude = new Set(opts?.exclude ?? []);
  for (const tool of ALL_TOOLS) {
    if (!exclude.has(tool.schema.name)) registry.register(tool);
  }
  if (!exclude.has("mount_mcp")) {
    registry.register(buildMountMcpTool(registry));
  }
  if (!exclude.has("tool_search")) {
    registry.register(buildToolSearchTool(registry));
  }
  return registry;
}

export { ToolRegistry } from "./registry.js";
