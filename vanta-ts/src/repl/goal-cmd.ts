import { lines } from "./format.js";
import { isVagueGoal, buildNextStepResend } from "./next.js";
import { dropIncompleteRalphWork, hasIncompleteRalphWork, readRalphState, selectNextIncompleteFeature, updateFeatureStatus, writeRalphState } from "../ralph/state.js";
import type { ReplCtx, SlashResult } from "./types.js";
import type { SlashHandler } from "./types.js";

/** Persist a new goal, patch the live prompt, and auto-fire GOAL-ACTION when vague. */
async function setNewGoal(arg: string, ctx: ReplCtx): Promise<SlashResult> {
  const ok = await ctx.setup.safety.addGoal(arg);
  if (!ok) return { output: "  could not set goal (kernel unreachable?)" };
  const sys = ctx.convo.messages[0];
  if (sys && sys.role === "system") sys.content += `\n\nNew standing goal — work toward it: ${arg}`;
  if (ctx.env.VANTA_GOAL_ACTION !== "0" && isVagueGoal(arg)) {
    const resend = await buildNextStepResend(ctx).catch(() => null);
    if (resend) return { output: `  ◎ goal set: ${arg}\n  · vague goal — surfacing one concrete next step…`, resend };
  }
  return { output: `  ◎ goal set: ${arg}` };
}

type Safety = ReplCtx["setup"]["safety"];
const activeGoals = async (safety: Safety): Promise<{ id: number; text: string }[]> =>
  (await safety.getGoals().catch(() => [])).filter((g) => g.status === "active");

async function goalStatus(safety: Safety): Promise<SlashResult> {
  const active = await activeGoals(safety);
  return { output: lines(active.map((g) => `  [${g.id}] ${g.text}`), "  (no active goals — /goal <text> to set one)") };
}

/** Activate a goal carried (paused) from a prior session: re-inject it into the
 * live prompt as the directive. Counterpart to the paused-on-launch default. */
async function goalResume(safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const active = await activeGoals(safety);
  if (!active.length) return { output: "  (no carried goal to resume — /goal <text> to set one)" };
  const sys = ctx.convo.messages[0];
  const text = active.map((g) => g.text).join("; ");
  if (sys && sys.role === "system") sys.content += `\n\nResumed standing goal — work toward it now: ${text}`;
  return { output: `  ▶ resumed goal: ${text}` };
}

async function goalResumeRalph(ctx: ReplCtx): Promise<SlashResult | null> {
  const state = await readRalphState(ctx.dataDir);
  if (!state || !hasIncompleteRalphWork(state)) return null;
  const next = selectNextIncompleteFeature(state);
  const resumed = next ? updateFeatureStatus(state, next.id, "in_progress") : state;
  await writeRalphState(ctx.dataDir, resumed);
  const sys = ctx.convo.messages[0];
  if (sys && sys.role === "system") {
    sys.content += `\n\nResumed Ralph loop — work toward it now:\nGoal: ${resumed.goal}${next ? `\nCurrent feature: [${next.id}] ${next.title}` : ""}`;
  }
  return { output: `  ▶ resumed Ralph loop: ${state.goal}${next ? ` — ${next.title}` : ""}` };
}

async function goalDrop(safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const active = await activeGoals(safety);
  for (const g of active) await safety.completeGoal(g.id);
  const state = await readRalphState(ctx.dataDir);
  if (!state || !hasIncompleteRalphWork(state)) return { output: `  · dropped ${active.length} active goal(s) — starting fresh` };
  await writeRalphState(ctx.dataDir, dropIncompleteRalphWork(state));
  return { output: `  · dropped ${active.length} active goal(s) and dropped Ralph loop — starting fresh` };
}

async function goalDone(arg: string, safety: Safety): Promise<SlashResult> {
  const id = Number(arg.split(/\s+/)[1]);
  if (!Number.isInteger(id)) return { output: "  usage: /goal done <id>" };
  const ok = await safety.completeGoal(id);
  return { output: ok ? `  ✓ completed goal ${id}` : `  could not complete goal ${id}` };
}

// `/goal` — show / set / resume / drop / complete a standing goal. A goal carried
// from a prior session starts PAUSED (resume to activate). Setting a goal patches
// the live prompt; a VAGUE goal auto-fires GOAL-ACTION (the /next micro-step).
export const goal: SlashHandler = async (arg, ctx) => {
  const safety = ctx.setup.safety;
  const sub = arg.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!arg || sub === "status") return goalStatus(safety);
  if (sub === "resume") return (await goalResumeRalph(ctx)) ?? goalResume(safety, ctx);
  if (sub === "clear" || sub === "drop") return goalDrop(safety, ctx);
  if (sub === "done") return goalDone(arg, safety);
  return setNewGoal(arg, ctx); // anything else is new goal text
};
