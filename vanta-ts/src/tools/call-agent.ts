import { z } from "zod";
import {
  buildAgentInvocation,
  runExternalAgent,
  knownAgents,
  detectInstalledAgents,
  type Invocation,
  type RunResult,
} from "../agents/external-cli.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";

const Args = z.object({
  agent: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  coding: z.boolean().optional(), // build-ready: the agent auto-accepts file edits so it can actually BUILD headless
});

/** List the agent CLIs actually installed on this machine (and how to add more). */
function listAgents(): ToolResult {
  const installed = detectInstalledAgents();
  if (installed.length) {
    return { ok: true, output: `Installed agents you can call: ${installed.join(", ")}. Add any other CLI in ~/.vanta/agents.json.` };
  }
  return { ok: true, output: `No known agent CLIs found on PATH. Known: ${knownAgents().join(", ")}. Add custom CLIs in ~/.vanta/agents.json.` };
}

/** Validate + resolve the agent/prompt into an invocation, or a user-facing error. */
function resolveCall(agent: string, prompt: string | undefined, model?: string, coding?: boolean): { error: string } | { inv: Invocation } {
  if (!prompt) return { error: "call_agent needs a prompt" };
  const inv = buildAgentInvocation(agent, prompt, { model, env: process.env, coding });
  if (!inv) return { error: `unknown agent "${agent}". Known: ${knownAgents().join(", ")}. Declare a custom one in ~/.vanta/agents.json.` };
  if (!detectInstalledAgents().includes(agent)) {
    return { error: `"${agent}" is not installed (not on PATH). Installed: ${detectInstalledAgents().join(", ") || "(none)"}.` };
  }
  return { inv };
}

/** Turn the spawn result into a tool result (installed / failed / answer). */
function formatResult(agent: string, res: RunResult): ToolResult {
  if (res.notInstalled) return { ok: false, output: `${agent} CLI not found on PATH.` };
  if (!res.ok) return { ok: false, output: `${agent} failed (exit ${res.code ?? "?"}): ${(res.stderr || res.stdout).trim().slice(0, 2000)}` };
  return { ok: true, output: `[${agent}]\n${res.stdout.trim() || "(no output)"}` };
}

export const callAgentTool: Tool = {
  schema: {
    name: "call_agent",
    description:
      "Call ANOTHER AI coding-agent CLI non-interactively (agent-to-agent: headless, no terminal) and return its result. Auto-detects whatever is installed (claude, codex, gemini, cursor-agent, opencode out of the box; ANY other CLI/harness declared in ~/.vanta/agents.json). Call with no agent (or agent='list') to list. Pass coding:true to delegate BUILDING — the agent runs build-ready (auto-accepts file edits) and actually writes/changes code, then returns what it did; use coding:true whenever the user wants the other agent to build/implement/fix/create code (without it, the agent can only answer, not edit files). Otherwise pass {agent, prompt, model?}. The called agent runs in its own harness. Use to delegate a build, get a second model's take, or cross-check.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Which agent CLI to call (e.g. claude, codex, gemini). Omit or 'list' to list detected agents." },
        prompt: { type: "string", description: "The prompt/task to send to the agent" },
        model: { type: "string", description: "Optional model override passed through to that agent's CLI" },
        coding: { type: "boolean", description: "Delegate BUILDING: the agent auto-accepts file edits so it can write/change code headless. Default false (answer-only)." },
      },
      required: [],
    },
  },
  describeForSafety: (a) =>
    `call external agent ${String(a.agent ?? "list")}: ${String(a.prompt ?? "")}`.slice(0, 200),
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "call_agent needs {agent, prompt} (or no agent to list installed ones)" };
    const { agent, prompt, model, coding } = parsed.data;

    if (!agent || agent === "list") return listAgents();

    const resolved = resolveCall(agent, prompt, model, coding);
    if ("error" in resolved) return { ok: false, output: resolved.error };

    const why = coding ? "spawns the agent build-ready (auto-accepts file edits) — it can write/change files in this project on its own" : "spawns an autonomous external agent CLI";
    const approved = await ctx.requestApproval(`call agent ${agent}${coding ? " in BUILD mode" : ""}: ${(prompt ?? "").slice(0, 100)}`, why, "call_agent");
    if (!approved) return { ok: false, output: "call_agent: declined" };

    // CALL-AGENT-STREAM: stream the called agent's output to the transcript as it runs.
    return formatResult(agent, await runExternalAgent(resolved.inv, { cwd: ctx.root, onChunk: ctx.onProgress }));
  },
};
