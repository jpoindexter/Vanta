import { lines } from "./format.js";
import { isVagueGoal, buildNextStepResend } from "./next.js";
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

// `/goal` — show / set / clear / complete a standing goal. Setting a goal also
// patches the live system prompt; a VAGUE goal auto-fires GOAL-ACTION (the /next
// single-micro-step prompt) so a concrete next action surfaces without /next.
export const goal: SlashHandler = async (arg, ctx) => {
  const safety = ctx.setup.safety;
  const sub = arg.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!arg || sub === "status") {
    const active = (await safety.getGoals().catch(() => [])).filter((g) => g.status === "active");
    return { output: lines(active.map((g) => `  [${g.id}] ${g.text}`), "  (no active goals — /goal <text> to set one)") };
  }
  if (sub === "clear") {
    const active = (await safety.getGoals().catch(() => [])).filter((g) => g.status === "active");
    for (const g of active) await safety.completeGoal(g.id);
    return { output: `  · cleared ${active.length} active goal(s)` };
  }
  if (sub === "done") {
    const id = Number(arg.split(/\s+/)[1]);
    if (!Number.isInteger(id)) return { output: "  usage: /goal done <id>" };
    const ok = await safety.completeGoal(id);
    return { output: ok ? `  ✓ completed goal ${id}` : `  could not complete goal ${id}` };
  }
  return setNewGoal(arg, ctx); // anything else is new goal text
};
