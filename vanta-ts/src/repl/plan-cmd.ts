import { spawnSubagent } from "../subagent/spawn.js";
import { buildRegistry } from "../tools/index.js";
import { planModeV2AgentCount, runPlanV2, formatPlanV2Progress, type SpawnOutcome } from "../plan/plan-v2.js";
import type { ReplCtx, SlashHandler, SlashResult } from "./types.js";

// VANTA-PLAN-MODE-V2 — /planv2 <task>.
//
// `/plan` already exists (the todo-list view), so this multi-agent plan
// executor is exposed as `/planv2`. It resolves the concurrent agent count from
// the plan tier (default 1, env-overridable 1–10 via VANTA_PLAN_V2_AGENT_COUNT),
// spawns that many sub-agents on disjoint slices of the task in parallel via
// spawnSubagent, and prints the aggregated progress + summary.
//
// Each worker runs the same kernel-gated loop with a child registry that
// EXCLUDES delegate, so a plan-v2 worker cannot recursively fan out.

/** Build the injected spawner: one kernel-gated worker per plan step. */
function buildSpawn(ctx: ReplCtx): (stepPrompt: string) => Promise<SpawnOutcome> {
  // Child registry excludes delegate → no runaway recursive spawn.
  const registry = buildRegistry({ exclude: ["delegate"] });
  const { safety, provider } = ctx.setup;
  const root = process.cwd();
  return async (stepPrompt: string): Promise<SpawnOutcome> => {
    try {
      const outcome = await spawnSubagent({
        goal: stepPrompt,
        instruction: stepPrompt,
        deps: { provider, safety, registry, root, requestApproval: async () => true },
      });
      return { ok: outcome.stoppedReason !== "interrupted", summary: outcome.finalText };
    } catch (err) {
      return { ok: false, summary: err instanceof Error ? err.message : String(err) };
    }
  };
}

/** /planv2 <task> — fan a task out across N concurrent plan-execution agents. */
export const planV2: SlashHandler = async (arg, ctx): Promise<SlashResult> => {
  const task = arg.trim();
  if (!task) return { output: "  usage: /planv2 <task>" };

  const count = planModeV2AgentCount(ctx.env);
  const header = `  ⚡ plan v2 — spawning ${count} agent(s) in parallel on: ${task}`;
  const result = await runPlanV2({ task, count, spawn: buildSpawn(ctx) });
  return { output: `${header}\n${formatPlanV2Progress(result.steps)}\n  ${result.summary}` };
};
