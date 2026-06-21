import type { SlashHandler } from "../repl/types.js";

export type PluginCommandMeta = { name: string; arg?: string; desc: string };
export type PluginCommand = PluginCommandMeta & { pluginName: string; handler: SlashHandler };

const CommandName = /^[a-z][a-z0-9-]{0,63}$/;

export class PluginCommandRegistry {
  private readonly commands = new Map<string, PluginCommand>();

  constructor(private readonly reserved = new Set<string>()) {}

  register(pluginName: string, name: string, handler: SlashHandler, meta?: { arg?: string; desc?: string }): void {
    if (!CommandName.test(name)) throw new Error(`invalid plugin command name: ${name}`);
    if (this.reserved.has(name)) throw new Error(`plugin command /${name} collides with a built-in command`);
    if (this.commands.has(name)) throw new Error(`plugin command /${name} is already registered`);
    this.commands.set(name, {
      pluginName,
      name,
      arg: meta?.arg,
      desc: meta?.desc ?? `plugin command from ${pluginName}`,
      handler,
    });
  }

  get(name: string): PluginCommand | undefined {
    return this.commands.get(name);
  }

  isReserved(name: string): boolean {
    return this.reserved.has(name);
  }

  list(): PluginCommandMeta[] {
    return [...this.commands.values()].map(({ name, arg, desc }) => ({ name, arg, desc }));
  }

  /** Distinct plugin names with at least one command registered (for /reload-plugins). */
  loadedPlugins(): string[] {
    return [...new Set([...this.commands.values()].map((c) => c.pluginName))];
  }
}
