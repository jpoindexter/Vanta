import type { Tool } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SlashHandler } from "../repl/types.js";
import type { PluginManifest } from "./manifest.js";
import { pluginToolPrefix } from "./manifest.js";
import type { PluginCommandRegistry } from "./commands.js";

export type PluginInfo = {
  name: string;
  version: string;
  dir: string;
  manifest: PluginManifest;
};

export type PluginContext = {
  plugin: PluginInfo;
  root: string;
  vantaHome: string;
  registerTool: (tool: Tool) => void;
  registerCommand: (name: string, handler: SlashHandler, meta?: { arg?: string; desc?: string }) => void;
  log: (message: string) => void;
};

export type PluginContribution = {
  tools: Tool[];
  commands: Array<{ name: string; handler: SlashHandler; meta?: { arg?: string; desc?: string } }>;
};

export function createPluginContext(opts: {
  manifest: PluginManifest;
  pluginDir: string;
  repoRoot: string;
  vantaHome: string;
  registry: ToolRegistry;
  commands: PluginCommandRegistry;
  log: (message: string) => void;
}): { ctx: PluginContext; contribution: PluginContribution } {
  const contribution: PluginContribution = { tools: [], commands: [] };
  const info: PluginInfo = {
    name: opts.manifest.name,
    version: opts.manifest.version,
    dir: opts.pluginDir,
    manifest: opts.manifest,
  };
  const prefix = pluginToolPrefix(opts.manifest.name);
  const stagedToolNames = new Set<string>();
  const stagedCommandNames = new Set<string>();

  const ctx: PluginContext = {
    plugin: info,
    root: opts.repoRoot,
    vantaHome: opts.vantaHome,
    registerTool(tool) {
      const name = tool.schema.name;
      if (!name.startsWith(prefix)) throw new Error(`plugin tool ${name} must start with ${prefix}`);
      if (opts.registry.get(name) || stagedToolNames.has(name)) throw new Error(`plugin tool ${name} collides with an existing tool`);
      if (!tool.describeForSafety) throw new Error(`plugin tool ${name} must define describeForSafety`);
      stagedToolNames.add(name);
      contribution.tools.push(wrapPluginTool(opts.manifest.name, tool));
    },
    registerCommand(name, handler, meta) {
      if (opts.commands.isReserved(name)) throw new Error(`plugin command /${name} collides with a built-in command`);
      if (opts.commands.get(name) || stagedCommandNames.has(name)) throw new Error(`plugin command /${name} is already registered`);
      stagedCommandNames.add(name);
      contribution.commands.push({ name, handler, meta });
    },
    log(message) {
      opts.log(`  · plugin ${opts.manifest.name}: ${message}`);
    },
  };
  return { ctx, contribution };
}

function wrapPluginTool(pluginName: string, tool: Tool): Tool {
  return {
    ...tool,
    describeForSafety: (args) => `plugin ${pluginName}: ${tool.describeForSafety!(args)}`,
    async execute(args, ctx) {
      try {
        return await tool.execute(args, ctx);
      } catch (err) {
        return { ok: false, output: `plugin ${pluginName}.${tool.schema.name} failed: ${(err as Error).message}` };
      }
    },
  };
}
