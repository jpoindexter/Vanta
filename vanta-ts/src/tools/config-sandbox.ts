import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { delegateEnv } from "./delegate.js";
import { buildRegistry } from "./index.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import {
  runSandbox,
  saveSandboxInput,
  loadSandboxInput,
  applyPromptPrefix,
  formatComparison,
  type ConfigOverride,
  type SandboxRunner,
  type Trace,
} from "../selfharness/sandbox.js";

// config_sandbox — test a config change (prompt/model/tool) end-to-end against a
// SAVED input, in isolation (a spawnSubagent worker; shares no parent state, no
// git mutation), and report a side-by-side trace vs a baseline default-config run.
// This file is the wiring leaf: it owns the real provider/registry/spawn deps so
// the sandbox CORE (selfharness/sandbox.ts) stays pure and cycle-free.

// Override shape declared inline (not imported from sandbox.ts) to keep the LLM
// boundary schema local. runSandbox re-parses with ConfigOverrideSchema.
const OverrideArg = z.object({
  promptPrefix: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  toolNames: z.array(z.string().min(1)).min(1).optional(),
});

const Args = z.object({
  action: z.enum(["run", "save", "list"]),
  name: z.string().min(1).optional(),
  instruction: z.string().min(1).optional(),
  override: OverrideArg.optional(),
  baseline: OverrideArg.optional(),
});

function dataDir(ctx: ToolContext): string {
  return join(ctx.root, ".vanta");
}

/** A scoped registry exposing only `toolNames` (everything else excluded). */
export function buildScopedRegistry(toolNames?: string[]): ReturnType<typeof buildRegistry> {
  if (!toolNames?.length) return buildRegistry();
  const wanted = new Set(toolNames);
  const all = buildRegistry().schemas().map((s) => s.name);
  return buildRegistry({ exclude: all.filter((name) => !wanted.has(name)) });
}

/** The default runner: a real isolated `spawnSubagent` with the override applied
 *  (overridden provider/model via delegateEnv, prompt prefix, tool subset). */
export function defaultSandboxRunner(ctx: ToolContext): SandboxRunner {
  return async ({ instruction, override }) => {
    const provider = resolveProvider(delegateEnv(process.env, override.provider, override.model));
    const registry = buildScopedRegistry(override.toolNames);
    const calls: string[] = [];
    const deps: AgentDeps = {
      provider,
      safety: ctx.safety,
      registry,
      root: ctx.root,
      requestApproval: ctx.requestApproval,
      onToolCall: (name) => calls.push(name),
    };
    const outcome: AgentOutcome = await spawnSubagent({
      goal: "config sandbox run (isolated, no git)",
      instruction: applyPromptPrefix(instruction, override.promptPrefix),
      deps,
    });
    return { finalText: outcome.finalText, toolCalls: calls, stoppedReason: outcome.stoppedReason } satisfies Trace;
  };
}

async function doSave(name: string, instruction: string, ctx: ToolContext): Promise<ToolResult> {
  // saveSandboxInput validates name/instruction (filename-safe, non-empty).
  const file = await saveSandboxInput(dataDir(ctx), { name, instruction });
  return { ok: true, output: `Saved sandbox input "${name}" → ${file}` };
}

async function doRun(name: string, override: ConfigOverride, baseline: ConfigOverride | undefined, ctx: ToolContext): Promise<ToolResult> {
  const input = await loadSandboxInput(dataDir(ctx), name);
  const cmp = await runSandbox({
    input,
    override,
    baseline,
    deps: { runner: defaultSandboxRunner(ctx) },
  });
  return { ok: true, output: formatComparison(cmp, override) };
}

export const configSandboxTool: Tool = {
  schema: {
    name: "config_sandbox",
    description:
      "Test a config change end-to-end without touching git. " +
      "action:save {name, instruction} stores a reusable input under .vanta/sandbox/inputs/. " +
      "action:run {name, override, baseline?} runs the saved input in an ISOLATED worker with the " +
      "candidate override (promptPrefix / model / provider / toolNames subset) AND a baseline default-config " +
      "run, then reports a side-by-side trace (tool calls + outcome) and their diff. No git mutation. " +
      "action:list explains usage.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["run", "save", "list"] },
        name: { type: "string", description: "saved input name (filename-safe)" },
        instruction: { type: "string", description: "save: the instruction text to store" },
        override: {
          type: "object",
          description: "run: candidate config override",
          properties: {
            promptPrefix: { type: "string", description: "text prepended to the system instruction" },
            model: { type: "string", description: "model id override" },
            provider: { type: "string", description: "provider override (openai|ollama|anthropic|…)" },
            toolNames: { type: "array", items: { type: "string" }, description: "restrict the worker to this tool subset" },
          },
        },
        baseline: {
          type: "object",
          description: "run: optional baseline override (defaults to default config)",
          properties: {
            promptPrefix: { type: "string" },
            model: { type: "string" },
            provider: { type: "string" },
            toolNames: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["action"],
    },
  },
  // Constant internal-op string: the sandbox is an isolated, no-git orchestration
  // op. Each worker tool call is assessed by the kernel as it happens, so echoing
  // the instruction here would only let its content false-trigger the classifier.
  describeForSafety: () => "run config sandbox (isolated, no git)",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'config_sandbox needs an "action" (run|save|list)' };
    const { action, name, instruction, override, baseline } = parsed.data;
    try {
      if (action === "list") {
        return { ok: true, output: "config_sandbox: save {name, instruction} a reusable input, then run {name, override} to compare a candidate config against a baseline. No git mutation." };
      }
      if (action === "save") {
        if (!name || !instruction) return { ok: false, output: "save needs name and instruction" };
        return await doSave(name, instruction, ctx);
      }
      if (!name) return { ok: false, output: "run needs the saved input name" };
      return await doRun(name, override ?? {}, baseline, ctx);
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  },
};
