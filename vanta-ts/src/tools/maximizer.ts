import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";
import { estimateCostUsd } from "../pricing.js";
import { runMaximizer, summarizeRun, type DelegateResult } from "../maximizer/runtime.js";
import { appendActivity, formatTrail, trailPath } from "../maximizer/trail.js";

// run_maximizer — higher-autonomy execution under HARD governance. It delegates
// across a task list and follows through, but every task is gated by a hard
// spend budget BEFORE it runs and lands in a visible activity-trail file ending
// in verified outcomes. Each delegate is a kernel-gated subagent (child registry
// excludes recursive spawn). errors-as-values: a parse/spawn failure returns a
// result, never throws across the boundary.

const Args = z.object({
  tasks: z.array(z.string().min(1)).min(1),
  budgetUsd: z.number().positive(),
});

/** Worker registry without the recursive-spawn tools — no runaway fan-out. */
function workerRegistry(): ReturnType<typeof buildRegistry> {
  return buildRegistry({ exclude: ["delegate", "swarm", "self_correct", "run_maximizer"] });
}

/** Cost of one worker run in USD from its reported token usage, else 0. */
function outcomeCostUsd(model: string, usage?: { inputTokens: number; outputTokens: number }): number {
  if (!usage) return 0;
  return estimateCostUsd(model, usage.inputTokens, usage.outputTokens) ?? 0;
}

/** A `delegate` that runs one task as a kernel-gated subagent and reports cost. */
function makeDelegate(ctx: ToolContext): (task: string) => Promise<DelegateResult> {
  return async (task: string) => {
    const provider = resolveProvider(process.env);
    try {
      const outcome = await spawnSubagent({
        goal: `Maximizer task: ${task}`,
        instruction: task,
        deps: { provider, safety: ctx.safety, registry: workerRegistry(), root: ctx.root, requestApproval: ctx.requestApproval },
      });
      const ok = outcome.stoppedReason === "done";
      return { ok, summary: `[${outcome.stoppedReason}] ${outcome.finalText}`, costUsd: outcomeCostUsd(provider.modelId(), outcome.usage) };
    } catch (err) {
      return { ok: false, summary: `worker error: ${err instanceof Error ? err.message : String(err)}`, costUsd: 0 };
    }
  };
}

async function runTool(data: z.infer<typeof Args>, ctx: ToolContext): Promise<ToolResult> {
  const dataDir = join(ctx.root, ".vanta");
  const file = trailPath(dataDir, randomUUID());
  let spend = 0;
  const run = await runMaximizer({
    tasks: data.tasks,
    budgetUsd: data.budgetUsd,
    deps: {
      delegate: makeDelegate(ctx),
      recordActivity: async (entry) => {
        spend += entry.costUsd;
        await appendActivity(file, entry);
      },
      now: Date.now,
      spendSoFar: () => spend,
    },
  });
  const output = [summarizeRun(run), "", "Activity trail:", formatTrail(run.trail)].join("\n");
  return { ok: run.completed.every((o) => o.ok) && run.completed.length > 0, output };
}

export const maximizerTool: Tool = {
  schema: {
    name: "run_maximizer",
    description:
      "Maximizer mode: higher-autonomy execution under a HARD budget. Delegates each task in " +
      "`tasks` to a worker (kernel-gated), follows through across all of them, records a visible " +
      "activity trail, and STOPS the moment cumulative spend reaches `budgetUsd`. Use it to get " +
      "more verified output per supervisor — it is bounded autonomy, not a blank check.",
    parameters: {
      type: "object",
      properties: {
        tasks: { type: "array", items: { type: "string" }, description: "ordered tasks to delegate and follow through" },
        budgetUsd: { type: "number", description: "hard USD spend cap for the whole run; execution stops when reached" },
      },
      required: ["tasks", "budgetUsd"],
    },
  },
  describeForSafety: (a) => {
    const n = Array.isArray(a.tasks) ? a.tasks.length : 0;
    const budget = typeof a.budgetUsd === "number" ? a.budgetUsd : 0;
    return `run maximizer over ${n} tasks (budget $${budget})`;
  },
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "run_maximizer needs a non-empty tasks[] and a positive budgetUsd" };
    try {
      return await runTool(parsed.data, ctx);
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
