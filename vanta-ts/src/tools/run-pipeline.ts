// RPC-PIPELINE-VERIFY — make SCRIPT-RPC-PIPELINE first-class: a `run_pipeline`
// tool the model can call to run a deterministic chain of tool calls in ONE turn.
// Only the final step's result returns to the model; intermediate outputs stay in
// bindings (zero-context-cost). Every step is kernel-gated exactly like a direct
// tool call — this is orchestration, never a permission escape.
import type { Tool, ToolContext, ToolResult } from "./types.js";
import type { ToolRegistry } from "./registry.js";
import {
  parsePipeline,
  runPipeline,
  type ToolResultLike,
} from "../workflow/rpc-pipeline.js";

const estTokens = (chars: number) => Math.ceil(chars / 4);

/** A kernel-gated callTool: routes each step through assess() + requestApproval,
 *  exactly like a direct tool call. Cannot bypass the gate. */
function gatedCallTool(registry: ToolRegistry, ctx: ToolContext) {
  return async (toolName: string, args: Record<string, unknown>): Promise<ToolResultLike> => {
    const tool = registry.get(toolName);
    if (!tool) return { ok: false, output: `unknown tool: ${toolName}` };
    const action = tool.describeForSafety?.(args) ?? `${toolName} ${JSON.stringify(args)}`;
    const verdict = await ctx.safety.assess(action);
    if (verdict.risk === "block") return { ok: false, output: `blocked: ${action}` };
    if (verdict.risk === "ask") {
      const approved = await ctx.requestApproval(action, `pipeline step: ${toolName}`, toolName);
      if (!approved) return { ok: false, output: `denied: ${action}` };
    }
    const res = await tool.execute(args, ctx);
    return { ok: res.ok, output: res.output };
  };
}

export interface PipelineSavings {
  stepCount: number;
  intermediateCount: number;
  savedChars: number;
  savedTokens: number;
  note: string;
}

/** Measure the context kept OUT of the model: every intermediate (non-final)
 *  bound output a per-call path would have sent back through the model. */
export function measureSavings(
  bindings: Record<string, string>,
  finalOutput: string,
  stepCount: number,
): PipelineSavings {
  const intermediate = Object.values(bindings).filter((v) => v !== finalOutput);
  const savedChars = intermediate.reduce((s, v) => s + v.length, 0);
  const savedTokens = estTokens(savedChars);
  const note =
    `pipeline ran ${stepCount} step(s) in one turn; ${intermediate.length} intermediate ` +
    `output(s) (~${savedTokens} tokens) stayed in bindings, out of model context.`;
  return { stepCount, intermediateCount: intermediate.length, savedChars, savedTokens, note };
}

function describePipeline(args: Record<string, unknown>): string {
  const steps = Array.isArray(args.steps) ? (args.steps as Array<{ tool?: string }>) : [];
  const tools = steps.map((s) => s?.tool).filter(Boolean).join(" → ");
  return `run a ${steps.length}-step tool pipeline: ${tools || "(empty)"}`;
}

async function execPipeline(
  args: Record<string, unknown>,
  ctx: ToolContext,
  registry: ToolRegistry,
): Promise<ToolResult> {
  const parsed = parsePipeline(args);
  if (!parsed.ok) return { ok: false, output: `invalid pipeline: ${parsed.error}` };
  const run = await runPipeline(parsed.pipeline, { callTool: gatedCallTool(registry, ctx) });
  if (!run.ok) {
    return { ok: false, output: `pipeline step ${run.failedStep + 1} failed: ${run.error}` };
  }
  const m = measureSavings(run.bindings, run.result.output, parsed.pipeline.steps.length);
  return { ok: true, output: `${run.result.output}\n\n— ${m.note}` };
}

/** Factory: needs the live registry to dispatch each step's tool (kernel-gated). */
export function buildRunPipelineTool(registry: ToolRegistry): Tool {
  return {
    schema: {
      name: "run_pipeline",
      description:
        "Run a linear, deterministic chain of tool calls in ONE turn. Each step calls a tool; " +
        "bind a step's output with `assignTo` and reference it in a later step's `args` via `$name` " +
        "or `{{name}}`. Only the FINAL step's result returns to you — intermediate outputs stay in " +
        "bindings, costing ~zero context. Every step is kernel-gated like a direct call. Use for " +
        "fetch→transform→write chains where you don't need to read each intermediate. " +
        'Example: steps=[{tool:"read_file",args:{path:"a.json"},assignTo:"raw"},' +
        '{tool:"run_code",args:{lang:"python",code:"...$raw..."},assignTo:"clean"},' +
        '{tool:"write_file",args:{path:"b.json",content:"{{clean}}"}}].',
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            description: "ordered tool calls; each {tool, args, assignTo?}",
            items: {
              type: "object",
              properties: {
                tool: { type: "string", description: "tool name to call" },
                args: { type: "object", description: "tool args; $name / {{name}} reference a prior assignTo" },
                assignTo: { type: "string", description: "bind this output to a name (kept out of context)" },
              },
              required: ["tool"],
            },
          },
        },
        required: ["steps"],
      },
    },
    describeForSafety: (args) => describePipeline(args),
    execute: (args, ctx) => execPipeline(args, ctx, registry),
  };
}
