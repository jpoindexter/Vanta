import type { McpClient, McpPromptDef } from "./client.js";
import type { Verdict } from "../types.js";

// MCP-SKILLS — map an MCP server's declared prompts to Vanta skill/command
// descriptors. An MCP "skill" is an MCP prompt: the server advertises it via
// `prompts/list` and renders it via `prompts/get`. Invoking the skill routes
// back to the server through the kernel-gated path (assess → getPrompt).
//
// This module is PURE + transport-agnostic: it takes a tiny client surface
// (listPrompts/getPrompt) and a kernel `assess` fn, so it unit-tests against a
// mocked client with no process spawn and no live kernel.

/** The slice of the kernel a skill invocation needs: the assess gate. */
export type SkillGate = (action: string) => Promise<Verdict>;

/** The slice of an MCP client a skill needs: list declarations + render one. */
export type SkillClient = Pick<McpClient, "listPrompts" | "getPrompt">;

/** Outcome of invoking an MCP skill — errors-as-values, never thrown. */
export type SkillInvokeResult = { ok: boolean; output: string };

/** A Vanta-side descriptor for one MCP skill, ready to register as a command. */
export type McpSkillDescriptor = {
  /** Slash command + skill name, e.g. `mcp_docs_summarize`. */
  name: string;
  /** Optional arg hint shown in `/help` and the catalog. */
  arg?: string;
  /** One-line description (from the prompt, with server provenance). */
  description: string;
  /** The server this skill came from (provenance for `/skills`). */
  server: string;
  /**
   * Invoke the skill: gate the call through the kernel (`assess`), then render
   * the prompt. The gate is passed at call time so the host binds the LIVE
   * kernel client. Errors-as-values — never throws across the boundary.
   */
  invoke: (arg: string, assess: SkillGate) => Promise<SkillInvokeResult>;
};

/**
 * Slugify a server+prompt pair into a slash command name. Must satisfy the
 * PluginCommandRegistry name rule (`/^[a-z][a-z0-9-]{0,63}$/` — lowercase,
 * hyphens only, no underscores), since MCP skills register through that path.
 */
export function skillCommandName(server: string, prompt: string): string {
  return `mcp-${server}-${prompt}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+$/g, "")
    .slice(0, 64);
}

/** Build the arg hint from a prompt's declared arguments, or undefined. */
function argHint(def: McpPromptDef): string | undefined {
  const names = (def.arguments ?? []).map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));
  return names.length ? names.join(" ") : undefined;
}

/**
 * Map free-text slash arg → the prompt's argument object. A prompt with one
 * declared arg gets the whole arg string; zero args ignores it; multiple args
 * receive the arg under the first declared name (best-effort — slash commands
 * are single-string). Pure.
 */
export function buildPromptArgs(def: McpPromptDef, arg: string): Record<string, unknown> {
  const first = (def.arguments ?? [])[0];
  if (!first || !arg.trim()) return {};
  return { [first.name]: arg.trim() };
}

/**
 * Map one MCP prompt to a Vanta skill descriptor. The `invoke` handler asks the
 * kernel to assess the call first (an MCP skill is an action like any other);
 * `block` refuses, `ask` refuses headlessly (a slash command has no human
 * approval channel — surface the reason), `allow` renders via `getPrompt`. Any
 * transport error becomes an `{ok:false}` value. Pure given its client.
 */
export function mcpPromptToSkillCommand(
  client: SkillClient,
  server: string,
  def: McpPromptDef,
): McpSkillDescriptor {
  return {
    name: skillCommandName(server, def.name),
    arg: argHint(def),
    description: def.description ?? `MCP skill ${def.name} from ${server}`,
    server,
    async invoke(arg: string, assess: SkillGate): Promise<SkillInvokeResult> {
      const action = `mcp skill ${server} ${def.name} ${arg}`.trim().slice(0, 200);
      let verdict: Verdict;
      try {
        verdict = await assess(action);
      } catch (err) {
        return { ok: false, output: `kernel unreachable — skill not run: ${(err as Error).message}` };
      }
      if (verdict.risk === "block") {
        return { ok: false, output: `blocked by kernel: ${verdict.reason}` };
      }
      if (verdict.risk === "ask") {
        return { ok: false, output: `requires approval (run the underlying MCP tool to confirm): ${verdict.reason}` };
      }
      try {
        const output = await client.getPrompt(def.name, buildPromptArgs(def, arg));
        return { ok: true, output: output || "(empty skill output)" };
      } catch (err) {
        return { ok: false, output: `mcp ${server}.${def.name} skill failed: ${(err as Error).message}` };
      }
    },
  };
}

/**
 * Fetch all skills (prompts) a connected MCP client declares and map them to
 * Vanta skill descriptors. Best-effort: a server that doesn't implement the
 * prompts capability (or errors) yields an empty list, never throws.
 */
export async function fetchMcpSkillsForClient(
  client: SkillClient,
  server: string,
): Promise<McpSkillDescriptor[]> {
  const prompts = await client.listPrompts().catch(() => [] as McpPromptDef[]);
  return prompts.map((def) => mcpPromptToSkillCommand(client, server, def));
}
