import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { canonicalWorkflow, diffWorkflows } from "../workflow/diff.js";
import { runWorkflowGraph } from "../workflow/execute.js";
import { parseWorkflowGraph, validateWorkflowGraph, type WorkflowGraph } from "../workflow/schema.js";
import { createWorkflowTask, markWorkflowTask } from "../workflow/task-store.js";

// WORKFLOWS: Dynamic multi-agent orchestration harness.
// Vanta can compose and run structured multi-agent workflows on the fly.
// Patterns: fan-out/synthesize, adversarial-verify, tournament, loop-until-done.
// Extends the existing delegate+swarm with typed step sequences + token budgets.

const StepSchema = z.object({
  id: z.string(),
  type: z.enum(["fan-out", "synthesize", "adversarial-verify", "tournament", "loop"]),
  instruction: z.string(),
  agents: z.number().int().min(1).max(16).optional(),
  budget: z.number().optional(),
  stopCondition: z.string().optional(),
});

const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(StepSchema).min(1).max(10),
  tokenBudget: z.number().optional(),
});

const Args = z.object({
  spec: z.unknown(),
  previous_spec: z.unknown().optional(),
  mode: z.enum(["validate", "diff", "run"]).optional(),
});

export type WorkflowStep = z.infer<typeof StepSchema>;
export type WorkflowSpec = z.infer<typeof WorkflowSchema>;

export type WorkflowResult = {
  name: string;
  steps: Array<{ id: string; type: string; output: string; agents: number }>;
  finalSynthesis: string;
  totalTokens: number;
};

/** Pure: validate a workflow spec. Returns null if valid, error string if not. */
export function validateWorkflow(spec: unknown): string | null {
  const result = WorkflowSchema.safeParse(spec);
  if (result.success) return null;
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/** Describe a single step for logging. */
export function describeStep(step: WorkflowStep): string {
  return `[${step.type}] ${step.instruction.slice(0, 60)}${step.agents ? ` ×${step.agents}` : ""}`;
}

export const workflowTool: Tool = {
  schema: {
    name: "compose_workflow",
    description:
      "Compose, diff, and run declarative agent workflow graphs. Supports agent, approval, and interview nodes plus next, branch, loop, and parallel transitions. Also accepts the legacy typed step sequence.",
    parameters: {
      type: "object",
      required: ["spec"],
      properties: {
        mode: { type: "string", enum: ["validate", "diff", "run"], description: "Default run. Use diff with previous_spec." },
        previous_spec: { type: "object", description: "Previous graph spec for stable diff output." },
        spec: {
          type: "object",
          description: "Workflow graph {id,title,start,nodes,transitions} or legacy {name,description,steps}.",
        },
      },
    },
  },
  describeForSafety: () => "compose and run multi-agent workflow (delegate sub-agents)",
  async execute(args, ctx: ToolContext) {
    const parsed = Args.safeParse(args);
    if (!parsed.success) return { ok: false, output: "compose_workflow needs {spec, mode?, previous_spec?}" };
    return trackWorkflowRun(parsed.data, ctx, () => runWorkflow(parsed.data, ctx));
  },
};

/** Run a workflow spec (graph or legacy). Pure dispatch; task tracking is the wrapper. */
async function runWorkflow(args: z.infer<typeof Args>, ctx: ToolContext): Promise<ToolResult> {
  if (looksLikeGraph(args.spec)) return runGraphMode(args, ctx);

  const err = validateWorkflow(args.spec);
  if (err) return { ok: false, output: `Invalid workflow spec: ${err}` };
  return runLegacyWorkflow(args.spec as WorkflowSpec);
}

async function runLegacyWorkflow(spec: WorkflowSpec): Promise<ToolResult> {
  const results: WorkflowResult["steps"] = [];
  let totalTokens = 0;
  const budget = spec.tokenBudget ?? 50_000;

  for (const step of spec.steps) {
    if (totalTokens >= budget) {
      results.push({ id: step.id, type: step.type, output: "[skipped — budget exhausted]", agents: 0 });
      continue;
    }
    const agentCount = step.agents ?? (step.type === "fan-out" ? 3 : 1);
    // Build the harness plan — actual subagent execution uses the `delegate` tool.
    // The workflow tool produces a structured execution plan the agent follows step-by-step.
    const agentInstructions = Array.from({ length: agentCount }, (_, i) => {
      if (step.type === "adversarial-verify")
        return `Agent ${i + 1}: Adversarially verify — "${step.instruction}". Default to refuted=true if uncertain.`;
      if (step.type === "tournament")
        return `Agent ${i + 1} (angle ${i + 1}/${agentCount}): "${step.instruction}". Choose a distinct approach.`;
      return `Agent ${i + 1}: "${step.instruction}"`;
    });
    const output = [
      `Step ${step.id} [${step.type}] — ${agentCount} agent(s):`,
      ...agentInstructions.map((ins) => `  • ${ins}`),
      step.stopCondition ? `  stop when: ${step.stopCondition}` : null,
    ].filter(Boolean).join("\n");
    totalTokens += agentCount * 1000; // plan estimate
    results.push({ id: step.id, type: step.type, output, agents: agentCount });
  }

  const finalSynthesis = results.map((r) => `## Step ${r.id} (${r.type})\n${r.output}`).join("\n\n");
  return {
    ok: true,
    output: JSON.stringify({ name: spec.name, steps: results.length, totalTokens, synthesis: finalSynthesis.slice(0, 2000) }),
  };
}

function looksLikeGraph(spec: unknown): spec is WorkflowGraph {
  return !!spec && typeof spec === "object" && "nodes" in spec && "start" in spec;
}

async function runGraphMode(args: z.infer<typeof Args>, ctx: ToolContext) {
  const err = validateWorkflowGraph(args.spec);
  if (err) return { ok: false, output: `Invalid workflow graph: ${err}` };
  const graph = parseWorkflowGraph(args.spec);
  if (args.mode === "validate") return { ok: true, output: canonicalWorkflow(graph) };
  if (args.mode === "diff") return diffGraph(args.previous_spec, graph);
  return executeGraph(graph, ctx);
}

function diffGraph(previous: unknown, graph: WorkflowGraph) {
  const err = validateWorkflowGraph(previous);
  if (err) return { ok: false, output: `Invalid previous workflow graph: ${err}` };
  const diff = diffWorkflows(parseWorkflowGraph(previous), graph);
  return { ok: true, output: JSON.stringify({ changed: diff.length > 0, diff }) };
}

async function executeGraph(graph: WorkflowGraph, ctx: ToolContext) {
  const { buildRegistry } = await import("./index.js");
  const { resolveProvider } = await import("../providers/index.js");
  const { spawnSubagent } = await import("../subagent/spawn.js");
  const registry = buildRegistry({ exclude: ["delegate", "swarm", "compose_workflow"] });
  const result = await runWorkflowGraph(graph, {
    assess: (action) => ctx.safety.assess(action),
    requestApproval: (action, reason) => ctx.requestApproval(action, reason, "compose_workflow"),
    runAgent: async (node) => {
      const outcome = await spawnSubagent({
        goal: node.goal ?? graph.title,
        instruction: node.instruction,
        deps: { provider: resolveProvider(process.env), safety: ctx.safety, registry, root: ctx.root, requestApproval: ctx.requestApproval },
        maxIterations: node.maxIterations,
      });
      return outcome.finalText;
    },
  });
  return { ok: result.ok, output: JSON.stringify(result, null, 2) };
}

const RESULT_PREVIEW = 280;

/**
 * Wrap an actual workflow run with a LocalWorkflowTask: create one (status
 * running) before the run, mark it done with the result or failed with the
 * error after. Validate/diff actions are not runs, so they aren't tracked.
 * Best-effort: a task-store failure (or a thrown run) never breaks the run —
 * the original result/throw is preserved.
 */
async function trackWorkflowRun(
  args: z.infer<typeof Args>,
  ctx: ToolContext,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  if (!isRunAction(args)) return run();
  const dataDir = join(ctx.root, ".vanta");
  const task = await createWorkflowTask(dataDir, workflowRunName(args.spec)).catch(() => null);
  try {
    const result = await run();
    if (task) {
      const outcome = result.ok ? { result: result.output.slice(0, RESULT_PREVIEW) } : { error: result.output.slice(0, RESULT_PREVIEW) };
      await markWorkflowTask(dataDir, task.id, result.ok ? "done" : "failed", outcome).catch(() => {});
    }
    return result;
  } catch (err) {
    if (task) await markWorkflowTask(dataDir, task.id, "failed", { error: (err as Error).message }).catch(() => {});
    throw err;
  }
}

/** An actual run = default mode or "run" (validate/diff never execute the workflow). */
function isRunAction(args: z.infer<typeof Args>): boolean {
  return args.mode === undefined || args.mode === "run";
}

/** Best-effort name for the run from either spec shape; falls back to a label. */
function workflowRunName(spec: unknown): string {
  if (spec && typeof spec === "object") {
    const s = spec as { title?: unknown; name?: unknown };
    if (typeof s.title === "string" && s.title.trim()) return s.title.trim();
    if (typeof s.name === "string" && s.name.trim()) return s.name.trim();
  }
  return "workflow";
}
