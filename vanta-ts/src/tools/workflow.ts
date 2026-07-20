import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { canonicalWorkflow, diffWorkflows } from "../workflow/diff.js";
import { runWorkflowGraph } from "../workflow/execute.js";
import { parseWorkflowGraph, validateWorkflowGraph, type WorkflowGraph } from "../workflow/schema.js";
import { createWorkflowTask, markWorkflowTask } from "../workflow/task-store.js";
import { buildStatefulAgentInstruction, parseStatefulAgentOutcome } from "../workflow/agent-outcome.js";
import { validateWorkflow, runLegacyWorkflow, type WorkflowSpec } from "./workflow-legacy.js";

// WORKFLOWS: Dynamic multi-agent orchestration harness. Vanta composes and runs
// structured multi-agent workflows on the fly — fan-out/synthesize, adversarial-
// verify, tournament, loop-until-done — over the graph format (../workflow/) and
// the legacy typed step sequence (./workflow-legacy.js).
export { validateWorkflow, describeStep } from "./workflow-legacy.js";
export type { WorkflowStep, WorkflowSpec, WorkflowResult } from "./workflow-legacy.js";

const Args = z.object({
  spec: z.unknown(),
  previous_spec: z.unknown().optional(),
  run_id: z.string().min(1).regex(/^[a-zA-Z0-9_.:-]+$/).optional(),
  mode: z.enum(["validate", "diff", "run"]).optional(),
});

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
        run_id: { type: "string", description: "Stable run ID used to resume an interrupted graph without replaying confirmed nodes." },
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

function looksLikeGraph(spec: unknown): spec is WorkflowGraph {
  return !!spec && typeof spec === "object" && "nodes" in spec && "start" in spec;
}

async function runGraphMode(args: z.infer<typeof Args>, ctx: ToolContext) {
  const err = validateWorkflowGraph(args.spec);
  if (err) return { ok: false, output: `Invalid workflow graph: ${err}` };
  const graph = parseWorkflowGraph(args.spec);
  if (args.mode === "validate") return { ok: true, output: canonicalWorkflow(graph) };
  if (args.mode === "diff") return diffGraph(args.previous_spec, graph);
  return executeGraph(graph, ctx, args.run_id);
}

function diffGraph(previous: unknown, graph: WorkflowGraph) {
  const err = validateWorkflowGraph(previous);
  if (err) return { ok: false, output: `Invalid previous workflow graph: ${err}` };
  const diff = diffWorkflows(parseWorkflowGraph(previous), graph);
  return { ok: true, output: JSON.stringify({ changed: diff.length > 0, diff }) };
}

async function executeGraph(graph: WorkflowGraph, ctx: ToolContext, runId?: string) {
  const { buildRegistry } = await import("./index.js");
  const { resolveProvider } = await import("../providers/index.js");
  const { spawnSubagent } = await import("../subagent/spawn.js");
  const registry = buildRegistry({ exclude: ["delegate", "swarm", "compose_workflow"] });
  const result = await runWorkflowGraph(graph, {
    assess: (action) => ctx.safety.assess(action),
    requestApproval: (action, reason) => ctx.requestApproval(action, reason, "compose_workflow"),
    runAgent: async (node, graphContext) => {
      const outcome = await spawnSubagent({
        goal: node.goal ?? graph.title,
        instruction: buildStatefulAgentInstruction(node, graphContext),
        deps: { provider: resolveProvider(process.env), safety: ctx.safety, registry, root: ctx.root, requestApproval: ctx.requestApproval },
        maxIterations: node.maxIterations,
      });
      return parseStatefulAgentOutcome(node, outcome.finalText);
    },
  }, { dataDir: join(ctx.root, ".vanta"), runId });
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
