import { describe, expect, it } from "vitest";
import { InMemoryToolRegistry } from "./registry.js";
import { buildToolSearchTool } from "./tool-search.js";
import type { ToolRegistry } from "./registry.js";
import type { Tool, ToolContext } from "./types.js";

function tool(name: string, description: string): Tool {
  return {
    schema: { name, description, parameters: { type: "object", properties: {} } },
    execute: async () => ({ ok: true, output: name }),
  };
}

class ScopedToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(private readonly allowed: Set<string>) {}

  register(toolDef: Tool): void {
    if (this.allowed.has(toolDef.schema.name)) this.tools.set(toolDef.schema.name, toolDef);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  schemas() {
    return this.list().map((t) => t.schema);
  }
}

const ctx: ToolContext = {
  root: "/tmp",
  safety: {} as ToolContext["safety"],
  requestApproval: async () => true,
};

describe("ToolRegistry port", () => {
  it("has a concrete in-memory adapter", () => {
    const registry: ToolRegistry = new InMemoryToolRegistry();
    registry.register(tool("read_file", "Read a scoped file"));

    expect(registry.get("read_file")?.schema.name).toBe("read_file");
    expect(registry.schemas().map((s) => s.name)).toEqual(["read_file"]);
  });

  it("lets consumers use a scoped registry implementation", async () => {
    const registry: ToolRegistry = new ScopedToolRegistry(new Set(["read_file"]));
    registry.register(tool("read_file", "Read a scoped file"));
    registry.register(tool("write_file", "Write a scoped file"));
    const search = buildToolSearchTool(registry);

    const res = await search.execute({ query: "file", maxResults: 5 }, ctx);

    expect(res.ok).toBe(true);
    expect(res.output).toContain("## read_file");
    expect(res.output).not.toContain("write_file");
  });
});
