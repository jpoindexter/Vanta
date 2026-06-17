import type { Tool } from "./types.js";
import type { ToolSchema } from "../providers/interface.js";

/**
 * The tool-registry PORT — register/lookup/list/schemas. Consumers depend on
 * this interface; construction funnels through {@link createToolRegistry}. Swap
 * in a namespaced/scoped/test registry = a new adapter + the factory, no
 * consumer edits. (ports/adapters, DECISIONS 2026-06-17.)
 */
export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  schemas(): ToolSchema[];
}

/** Build the default in-memory registry. The one place that constructs an impl. */
export function createToolRegistry(): ToolRegistry {
  return new MapToolRegistry();
}

/** Map-backed ToolRegistry — the only impl. */
export class MapToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.schema.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  schemas(): ToolSchema[] {
    return this.list().map((t) => t.schema);
  }
}
