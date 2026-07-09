import { lines } from "./format.js";
import { isVagueGoal, buildNextStepResend } from "./next.js";
import { appendVelocityEvent, readVelocityEvents } from "../velocity/store.js";
import { velocityClosureWarning } from "../velocity/closure.js";
import { addGoalDependency, parseGoalDepArgs, readGoalDeps, wakingDependents, type GoalDepEdge } from "../goals/deps.js";
import { dropIncompleteRalphWork, hasIncompleteRalphWork, readRalphState, selectNextIncompleteFeature, updateFeatureStatus, writeRalphState } from "../ralph/state.js";
import type { ReplCtx, SlashResult } from "./types.js";
import type { SlashHandler } from "./types.js";
import { formatGoalLedger } from "./goal-ledger.js";
import { createGoalSentinel } from "../goals/sentinel.js";
import type { Goal } from "../types.js";

/** Persist a new goal, patch the live prompt, and auto-fire GOAL-ACTION when vague. */
async function setNewGoal(arg: string, ctx: ReplCtx): Promise<SlashResult> {
  const ok = await ctx.setup.safety.addGoal(arg);
  if (!ok) return { output: "  could not set goal (kernel unreachable?)" };
  ctx.state.activeGoal = arg; // footer ◇ tracks the session's working goal
  const sys = ctx.convo.messages[0];
  if (sys && sys.role === "system") sys.content += `\n\nNew standing goal — work toward it: ${arg}`;
  // ND-VELOCITY-CLOSURE: count the goal as a capture, then warn if we're starting
  // far more than we finish. Best-effort — a velocity failure never breaks /goal.
  const closure = await velocityClosureFor(arg, ctx);
  if (ctx.env.VANTA_GOAL_ACTION !== "0" && isVagueGoal(arg)) {
    const resend = await buildNextStepResend(ctx).catch(() => null);
    if (resend) return { output: `  ◎ goal set: ${arg}\n  · vague goal — surfacing one concrete next step…${closure}`, resend };
  }
  return { output: `  ◎ goal set: ${arg}${closure}` };
}

/**
 * ND-VELOCITY-CLOSURE: record the new goal as a `capture` velocity event (deduped
 * by goal text) and return the formatted closure warning (or "") when the
 * capture:ship ratio exceeds 5:1. Cross-session via the shared velocity store.
 * Fully best-effort: any failure returns "" so /goal output is unaffected.
 */
async function velocityClosureFor(arg: string, ctx: ReplCtx): Promise<string> {
  try {
    const events = await readVelocityEvents(ctx.env);
    if (!events.some((e) => e.type === "capture" && e.itemId === arg)) {
      await appendVelocityEvent(ctx.env, { type: "capture", itemId: arg, at: ctx.now().toISOString() });
      events.push({ type: "capture", itemId: arg, at: ctx.now().toISOString() });
    }
    const warning = velocityClosureWarning(events);
    return warning ? `\n${warning}` : "";
  } catch {
    return "";
  }
}

type Safety = ReplCtx["setup"]["safety"];
const activeGoals = async (safety: Safety): Promise<Goal[]> =>
  (await safety.getGoals().catch(() => [])).filter((g) => g.status === "active");

async function goalStatus(safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const goals = await safety.getGoals().catch(() => []);
  const deps = await readGoalDeps(ctx.dataDir);
  return { output: goals.length ? formatGoalLedger(goals, deps.edges) : lines([], "  (no active goals — /goal <text> to set one)") };
}

/** Activate a goal carried (paused) from a prior session: re-inject it into the
 * live prompt as the directive. Counterpart to the paused-on-launch default. */
async function goalResume(safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const active = await activeGoals(safety);
  if (!active.length) return { output: "  (no carried goal to resume — /goal <text> to set one)" };
  const sys = ctx.convo.messages[0];
  const text = active.map((g) => g.text).join("; ");
  ctx.state.activeGoal = text; // paused → active: surface it in the footer ◇
  if (sys && sys.role === "system") sys.content += `\n\nResumed standing goal — work toward it now: ${text}`;
  return { output: `  ▶ resumed goal: ${text}` };
}

async function goalResumeRalph(ctx: ReplCtx): Promise<SlashResult | null> {
  const state = await readRalphState(ctx.dataDir);
  if (!state || !hasIncompleteRalphWork(state)) return null;
  const next = selectNextIncompleteFeature(state);
  const resumed = next ? updateFeatureStatus(state, next.id, "in_progress") : state;
  await writeRalphState(ctx.dataDir, resumed);
  ctx.state.activeGoal = resumed.goal; // resumed Ralph loop is the working goal
  const sys = ctx.convo.messages[0];
  if (sys && sys.role === "system") {
    sys.content += `\n\nResumed Ralph loop — work toward it now:\nGoal: ${resumed.goal}${next ? `\nCurrent feature: [${next.id}] ${next.title}` : ""}`;
  }
  return { output: `  ▶ resumed Ralph loop: ${state.goal}${next ? ` — ${next.title}` : ""}` };
}

async function goalDrop(safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const active = await activeGoals(safety);
  for (const g of active) await safety.completeGoal(g.id);
  ctx.state.activeGoal = null; // cleared: footer ◇ goes blank immediately
  const state = await readRalphState(ctx.dataDir);
  if (!state || !hasIncompleteRalphWork(state)) return { output: `  · dropped ${active.length} active goal(s) — starting fresh` };
  await writeRalphState(ctx.dataDir, dropIncompleteRalphWork(state));
  return { output: `  · dropped ${active.length} active goal(s) and dropped Ralph loop — starting fresh` };
}

async function goalDone(arg: string, safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  const parsed = parseDoneArgs(arg);
  const id = parsed.id;
  if (!Number.isInteger(id)) return { output: "  usage: /goal done <id>" };
  const before = await safety.getGoals().catch(() => []);
  const completed = before.find((g) => g.id === id);
  const ok = await safety.completeGoal(id);
  if (!ok) return { output: `  could not complete goal ${id}` };
  const [goals, deps] = await Promise.all([safety.getGoals().catch(() => []), readGoalDeps(ctx.dataDir)]);
  const woke = wakingDependents(id, goals, deps.edges);
  const suffix = woke.length ? `\n  ▶ woke: ${woke.map((g) => `#${g.id} ${g.text}`).join("; ")}` : "";
  const sentinel = completed && parsed.check
    ? await createGoalSentinel(ctx.dataDir, { goalId: id, goalText: completed.text, command: parsed.check, now: ctx.now() })
    : null;
  const sentinelLine = sentinel ? `\n  ◇ watching: ${sentinel.id} — ${sentinel.command}` : "";
  return { output: `  ✓ completed goal ${id}${suffix}${sentinelLine}` };
}

async function goalDependency(arg: string, ctx: ReplCtx, mode: "blocks" | "blocked_by"): Promise<SlashResult> {
  const edge = parseGoalDepArgs(arg, mode);
  if (!edge) return { output: `  usage: /goal ${mode} <${mode === "blocks" ? "blocker" : "dependent"}> <${mode === "blocks" ? "dependent" : "blocker"}>` };
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const missing = missingGoalIds(edge, goals.map((g) => g.id));
  if (missing.length) return { output: `  unknown goal id(s): ${missing.join(", ")}` };
  await addGoalDependency(ctx.dataDir, edge);
  return { output: `  linked: #${edge.blockerId} blocks #${edge.dependentId}` };
}

function missingGoalIds(edge: GoalDepEdge, ids: number[]): number[] {
  const known = new Set(ids);
  return [edge.blockerId, edge.dependentId].filter((id) => !known.has(id));
}

// `/goal` — show / set / resume / drop / complete a standing goal. A goal carried
// from a prior session starts PAUSED (resume to activate). Setting a goal patches
// the live prompt; a VAGUE goal auto-fires GOAL-ACTION (the /next micro-step).
export const goal: SlashHandler = async (arg, ctx) => {
  const safety = ctx.setup.safety;
  const sub = arg.split(/\s+/)[0]?.toLowerCase() ?? "";
  return handleGoalSubcommand(arg, sub, safety, ctx);
};

async function handleGoalSubcommand(arg: string, sub: string, safety: Safety, ctx: ReplCtx): Promise<SlashResult> {
  if (!arg || sub === "status") return goalStatus(safety, ctx);
  if (sub === "resume") return (await goalResumeRalph(ctx)) ?? goalResume(safety, ctx);
  if (["clear", "drop"].includes(sub)) return goalDrop(safety, ctx);
  if (sub === "blocks") return goalDependency(arg, ctx, "blocks");
  if (["blocked_by", "blocked-by"].includes(sub)) return goalDependency(arg, ctx, "blocked_by");
  if (sub === "done") return goalDone(arg, safety, ctx);
  return setNewGoal(arg, ctx);
}

function parseDoneArgs(arg: string): { id: number; check?: string } {
  const parts = arg.trim().split(/\s+/);
  const id = Number(parts[1]);
  const checkIdx = parts.indexOf("--check");
  const check = checkIdx === -1 ? undefined : parts.slice(checkIdx + 1).join(" ").trim();
  return { id, check: check || undefined };
}
