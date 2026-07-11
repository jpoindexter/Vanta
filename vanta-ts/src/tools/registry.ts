import type { Tool } from "./types.js";
import type { ToolSchema } from "../providers/interface.js";

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  schemas(): ToolSchema[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  constructor(private readonly allowed?: ReadonlySet<string>) {}

  register(tool: Tool): void {
    if (this.allowed && !this.allowed.has(tool.schema.name)) return;
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

export const ToolRegistry = InMemoryToolRegistry;
