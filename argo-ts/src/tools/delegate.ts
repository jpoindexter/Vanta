import { z } from "zod";
import type { Tool } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";

const Args = z.object({
  goal: z.string().min(1),
  instruction: z.string().min(1),
  max_iterations: z.number().int().min(1).max(50).optional(),
});

export const delegateTool: Tool = {
  schema: {
    name: "delegate",
    description:
      "Delegate a scoped subtask to a worker agent. The worker runs its own loop with the same tools (minus delegate) and returns its final result.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The worker's scoped goal — the outcome to achieve",
        },
        instruction: {
          type: "string",
          description: "Concrete instructions for the worker to follow",
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Optional cap on the worker's loop iterations (1-50)",
        },
      },
      required: ["goal", "instruction"],
    },
  },
  // Constant string by design: delegation is an internal orchestration op. The
  // worker's own tool calls are each assessed by the kernel as they happen, so
  // echoing the goal/instruction here would only let their content false-trigger
  // the safety classifier.
  describeForSafety: () => "delegate a subtask to a worker agent",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: "delegate needs goal and instruction strings",
      };
    }
    try {
      const { goal, instruction, max_iterations: maxIterations } = parsed.data;
      const provider = resolveProvider(process.env);
      // Child cannot spawn further delegates — prevents runaway recursion.
      const registry = buildRegistry({ exclude: ["delegate"] });
      const outcome = await spawnSubagent({
        goal,
        instruction,
        deps: {
          provider,
          safety: ctx.safety,
          registry,
          root: ctx.root,
          requestApproval: ctx.requestApproval,
          maxIterations,
        },
        maxIterations,
      });
      return {
        ok: true,
        output: `[worker:${outcome.stoppedReason}] ${outcome.finalText}`,
      };
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  },
};
