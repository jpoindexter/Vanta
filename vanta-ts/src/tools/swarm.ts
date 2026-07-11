import { z } from "zod";
import type { Tool } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { providerOverrideEnv } from "../providers/override-env.js";

// Inlined (not imported from delegate.js) to avoid a load-time import cycle
// swarm → delegate → tools/index → swarm.
function workerEnv(env: NodeJS.ProcessEnv, provider?: string, model?: string): NodeJS.ProcessEnv {
  return providerOverrideEnv(env, provider, model);
}

// Run several scoped subtasks IN PARALLEL (a swarm) — each its own worker agent,
// optionally on its own model/provider — and return all results. Built on
// spawnSubagent + delegateEnv (so each worker can be routed like /delegate).
// Children can't spawn delegate/swarm (no runaway recursion).

const TaskSchema = z.object({
  goal: z.string().min(1),
  instruction: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
});
const Args = z.object({
  tasks: z.array(TaskSchema).min(1).max(5),
  max_iterations: z.number().int().min(1).max(50).optional(),
});

export const swarmTool: Tool = {
  schema: {
    name: "swarm",
    description:
      "Run up to 5 scoped subtasks IN PARALLEL as worker agents, each optionally on its own " +
      "model/provider, and get all results back. Use to fan a goal across workers — research three " +
      "things at once, or run one task on local ollama and a harder one on gpt-4o simultaneously.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          maxItems: 5,
          description: "The parallel subtasks",
          items: {
            type: "object",
            properties: {
              goal: { type: "string", description: "The worker's scoped goal" },
              instruction: { type: "string", description: "Concrete instructions" },
              provider: { type: "string", description: "Optional backend (openai|ollama|gemini|…)" },
              model: { type: "string", description: "Optional model id" },
            },
            required: ["goal", "instruction"],
          },
        },
        max_iterations: { type: "integer", minimum: 1, maximum: 50, description: "Per-worker loop cap" },
      },
      required: ["tasks"],
    },
  },
  describeForSafety: () => "run a parallel swarm of worker agents",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "swarm needs tasks: [{goal, instruction, provider?, model?}]" };
    const { tasks, max_iterations: maxIterations } = parsed.data;
    const { buildRegistry } = await import("./index.js"); // lazy → no import cycle
    const registry = buildRegistry({ exclude: ["delegate", "swarm"] });

    const results = await Promise.all(
      tasks.map(async (t, i) => {
        try {
          const provider = resolveProvider(workerEnv(process.env, t.provider, t.model));
          const outcome = await spawnSubagent({
            goal: t.goal,
            instruction: t.instruction,
            deps: { provider, safety: ctx.safety, registry, root: ctx.root, requestApproval: ctx.requestApproval, maxIterations },
            maxIterations,
          });
          return `[worker ${i + 1}:${outcome.stoppedReason}] ${outcome.finalText}`;
        } catch (err) {
          return `[worker ${i + 1}:error] ${(err as Error).message}`;
        }
      }),
    );
    return { ok: true, output: results.join("\n\n") };
  },
};
