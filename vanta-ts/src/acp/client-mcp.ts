import { mountMcpServers, type MountResult } from "../mcp/mount.js";
import { InMemoryToolRegistry, type ToolRegistry } from "../tools/registry.js";
import type { AcpMcpServer } from "./protocol.js";

type Mount = (
  registry: ToolRegistry,
  env: NodeJS.ProcessEnv,
  log?: (message: string) => void,
  opts?: { cwd?: string },
) => Promise<MountResult>;
type ClientMcpOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  mount?: Mount;
};

export function buildClientMcpConfig(servers: readonly AcpMcpServer[]): {
  servers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
} {
  return {
    servers: Object.fromEntries(servers.map((server) => [
      server.name,
      {
        command: server.command,
        args: server.args,
        env: Object.fromEntries(server.env.map(({ name, value }) => [name, value])),
      },
    ])),
  };
}

export async function createClientMcpRegistry(
  base: ToolRegistry,
  servers: readonly AcpMcpServer[],
  options: ClientMcpOptions,
): Promise<{ registry: ToolRegistry; dispose: () => void }> {
  const { cwd, env = process.env, mount = mountMcpServers } = options;
  const registry = new InMemoryToolRegistry();
  for (const tool of base.list()) registry.register(tool);
  if (servers.length === 0) return { registry, dispose: () => {} };
  const scopedEnv = {
    ...env,
    VANTA_MCP_SERVERS: JSON.stringify(buildClientMcpConfig(servers)),
  };
  const result = await mount(registry, scopedEnv, () => {}, { cwd });
  return { registry, dispose: result.dispose };
}
