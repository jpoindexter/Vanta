import type { PluginCommandRegistry } from "../plugins/commands.js";
import type { SlashHandler } from "../repl/types.js";
import { gatherMcpConnections, type McpConnection } from "./connect.js";
import { fetchMcpSkillsForClient, type McpSkillDescriptor, type SkillClient } from "./skills.js";

// MCP-SKILLS mount layer — let MCP servers provide skills/slash commands.
// Feature-gated behind VANTA_MCP_SKILLS (default off), mirroring the reference's
// MCP_SKILLS gate. When on, every connected server's declared prompts become
// slash commands registered through the EXISTING PluginCommandRegistry (the same
// path plugin commands use — not a fork), so they appear in `/skills` and are
// invokable as `/mcp_<server>_<prompt>`. Each invocation routes back to the MCP
// server through the kernel-gated path. Best-effort: a failed server is skipped.

/** True when MCP-provided skills are enabled. Off unless explicitly turned on. */
export function mcpSkillsEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.VANTA_MCP_SKILLS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** A registered MCP skill, kept so hosts (e.g. `/skills`) can list it. */
export type RegisteredMcpSkill = { name: string; description: string; server: string };

export type MountSkillsResult = { skills: RegisteredMcpSkill[]; dispose: () => void };

/** Adapt a pure skill descriptor into a REPL `SlashHandler` (reads the live kernel gate per call). */
function toSlashHandler(skill: McpSkillDescriptor): SlashHandler {
  return async (arg, ctx) => {
    const res = await skill.invoke(arg, ctx.setup.safety.assess.bind(ctx.setup.safety));
    return { output: `  ${res.output}` };
  };
}

/**
 * Register every connected MCP server's skills as plugin commands. No-op when
 * the gate is off or no server declares skills. Returns the registered skill
 * list (for `/skills`) plus a `dispose` to close the live clients. A name that
 * collides with a built-in or another plugin command is skipped, not fatal.
 */
export async function mountMcpSkills(
  commands: PluginCommandRegistry,
  env: NodeJS.ProcessEnv = process.env,
  opts: { cwd?: string; log?: (msg: string) => void; connections?: McpConnection[] } = {},
): Promise<MountSkillsResult> {
  const log = opts.log ?? (() => {});
  if (!mcpSkillsEnabled(env)) return { skills: [], dispose: () => {} };

  const connections = opts.connections ?? (await gatherMcpConnections({ env, cwd: opts.cwd }));
  const registered: RegisteredMcpSkill[] = [];
  const clients = connections.map((c) => c.client).filter((c): c is NonNullable<typeof c> => Boolean(c));

  for (const conn of connections) {
    if (conn.status !== "connected" || !conn.client) continue;
    const client: SkillClient = conn.client;
    const descriptors = await fetchMcpSkillsForClient(client, conn.name).catch(() => []);
    for (const skill of descriptors) {
      try {
        commands.register(conn.name, skill.name, toSlashHandler(skill), { arg: skill.arg, desc: skill.description });
        registered.push({ name: skill.name, description: skill.description, server: conn.name });
      } catch (err) {
        log(`  · mcp skill ${skill.name} skipped — ${(err as Error).message}`);
      }
    }
    if (descriptors.length) log(`  · mcp: ${conn.name} provided ${descriptors.length} skill(s)`);
  }

  const dispose = (): void => {
    for (const c of clients) { try { c.close(); } catch { /* already gone */ } }
  };
  return { skills: registered, dispose };
}
