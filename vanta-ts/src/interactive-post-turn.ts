/**
 * interactive-post-turn.ts — the post-send pipeline for one REPL turn (extracted
 * from interactive-turn.ts to satisfy the file size gate). Owns everything that
 * runs AFTER convo.send(): cost accounting, auto-handoff, save, review, session
 * memory, gates, reflect, and the goal/stop-hook continuation decision. No
 * public API beyond what interactive-turn.ts re-exports.
 */
import { join } from "node:path";
import { estimateCostUsd, addTurnCost, formatTurnCost } from "./pricing.js";
import { recordTurnSpend } from "./cost/ledger.js";
import { guardBeforeTurn } from "./budget/guard.js";
import { statusFor, DEFAULT_WARN_FRACTION, type Budget } from "./budget/types.js";
import { resolveSessionCap } from "./budget/session-cap.js";
import { maybeAutoHandoff } from "./repl/auto-handoff.js";
import { shouldSuggestContextUpgrade, buildContextUpgradeNote } from "./repl/context-upgrade.js";
import { pruneVolatileSkills } from "./skills/volatile.js";
import {
  writeRunMemory,
  reviewAfterTurn,
  isExplicitChoiceWall,
  memoryExtractAfterTurn,
  sessionMemoryAfterTurn,
  brainLearnAfterTurn,
  dialecticAfterTurn,
  criticAfterTurn,
  antiSlopAfterText,
} from "./session.js";
import { runPostTurnGates } from "./repl/post-turn-gates.js";
import { suggestSkillFromRun } from "./projects/commands.js";
import { saveSession } from "./sessions/store.js";
import { reflectAfterTurn } from "./repl/reflect-correct.js";
import { checkGoalLoop } from "./repl/goal-condition.js";
import { fireStopHook } from "./hooks/shell-hooks.js";
import { buildAgentHookDeps } from "./hooks/agent-hook-deps.js";
import type { HookRunDeps } from "./hooks/shell-hook-run.js";
import type { TurnDeps } from "./interactive-turn.js";
import type { createConversation } from "./agent.js";

type ConvoRef = ReturnType<typeof createConversation>;

export type PostTurnOpts = {
  outcome: Awaited<ReturnType<ConvoRef["send"]>>;
  text: string;
  t0: number;
  turnStart: string;
  deps: TurnDeps;
};

/** Post-send pipeline: cost, handoff, save, review, session memory, gates, reflect.
 *  Returns continueWith when an active goal has an unmet done-condition. */
export async function runPostTurnPipeline(o: PostTurnOpts): Promise<{ continueWith: string | null }> {
  const { outcome, text, t0, turnStart, deps } = o;
  const { convo, setup, state, repoRoot, gatesRef } = deps;
  const choiceWall = isExplicitChoiceWall(outcome.finalText);
  pruneVolatileSkills(convo.messages);
  console.log(`\n${outcome.finalText}`);
  if (outcome.usage) await recordTurnCost(outcome, t0, deps);
  await handleAutoHandoff(outcome, deps);
  maybeSuggestContextUpgrade(outcome, deps);
  await saveSession(state.sessionId, convo.messages, { started: state.started, title: state.title, providerId: state.providerId, modelId: state.modelId }).catch(() => {});
  await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction: text, finalText: outcome.finalText, now: turnStart, sessionId: state.sessionId, turnIndex: state.turnIndex });
  if (!choiceWall) await suggestSkillFromRun(text, process.env);
  await antiSlopAfterText(outcome.finalText, (note) => console.log(`\n${note}`)).catch(() => {});
  await reviewAfterTurn({ provider: setup.provider, safety: setup.safety, root: repoRoot, transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex, deferMutation: choiceWall });
  memoryExtractAfterTurn({ provider: setup.provider, transcript: convo.messages });
  const newScratch = await sessionMemoryAfterTurn({ provider: setup.provider, dataDir: join(repoRoot, ".vanta"), transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex });
  if (newScratch) convo.setSessionMemory(newScratch);
  const learned = await brainLearnAfterTurn({ provider: setup.provider, transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex });
  if (learned.length) console.log(`  ◈ learned: ${learned.map((l) => (l.length > 60 ? `${l.slice(0, 57)}…` : l)).join(" · ")}`);
  const modeled = await dialecticAfterTurn({ provider: setup.provider, transcript: convo.messages, sessionId: state.sessionId, turnIndex: state.turnIndex });
  reportDialectic(modeled);
  const activeGoalText = setup.goals.find((g) => g.status === "active")?.text ?? "";
  await criticAfterTurn({ provider: setup.provider, goal: activeGoalText, messages: convo.messages, onNote: (note) => console.log(`\n${note}`) });
  gatesRef.current = await runPostTurnGates(gatesRef.current, { messages: convo.messages, safety: setup.safety, dataDir: join(repoRoot, ".vanta"), onNote: (note) => console.log(`\n${note}`), turnIndex: state.turnIndex, startedMs: Date.parse(state.started) || Date.now(), now: Date.now() });
  const lastUserMsg = [...convo.messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : "") : "";
  await reflectAfterTurn(lastUserText, process.env);
  const stopCtx = { sessionId: state.sessionId, finalResponse: outcome.finalText, turnIndex: state.turnIndex };
  const [goalContinue, hookContext] = await Promise.all([
    checkGoalLoop({ safety: setup.safety, cwd: repoRoot, onNote: (n) => console.log(n) }).catch(() => null),
    fireStopHook(join(repoRoot, ".vanta"), stopCtx, { cwd: repoRoot, ...turnHookDeps(deps) }).catch(() => null),
  ]);
  return { continueWith: goalContinue ?? hookContext ?? null };
}

function reportDialectic(result: Awaited<ReturnType<typeof dialecticAfterTurn>>): void {
  if (!result.changed.length) return;
  const noun = result.changed.length === 1 ? "belief" : "beliefs";
  const verb = result.reason === "self-report" ? "accepted" : "updated";
  console.log(`  ◈ operator model: ${result.changed.length} ${noun} ${verb}`);
}

/**
 * VANTA-BUDGET-CAP: stop the loop when accumulated frontier spend reaches the
 * --max-budget-usd / VANTA_MAX_BUDGET_USD cap. No-op when unset (cap === null),
 * so behavior is byte-identical without a cap. Prints current spend, then flags
 * the halt ref the REPL loop reads to end the session cleanly (no throw).
 */
/** Console-log the turn's cost, fold it into the session total, persist it to the
 *  spend ledger for `/usage breakdown` (PCLIP-COST-ATTRIBUTION), and check the
 *  session budget cap. No-ops if the turn reported no usage. Exported for direct
 *  unit testing — the full pipeline pulls in too many unrelated subsystems to
 *  mock cheaply. */
export async function recordTurnCost(
  outcome: Awaited<ReturnType<ConvoRef["send"]>>,
  t0: number,
  deps: TurnDeps,
): Promise<void> {
  if (!outcome.usage) return;
  const { setup, state, repoRoot } = deps;
  const cost = estimateCostUsd(setup.provider.modelId(), outcome.usage.inputTokens, outcome.usage.outputTokens);
  console.log(`  ${formatTurnCost({ inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, elapsedMs: Date.now() - t0, cost, tokensSaved: outcome.tokensSaved })}`);
  state.sessionCost = addTurnCost(state.sessionCost, process.env.VANTA_PROVIDER, cost, outcome.tokensSaved);
  const activeGoalId = setup.goals.find((g) => g.status === "active")?.id;
  await recordTurnSpend(join(repoRoot, ".vanta"), {
    costUsd: cost,
    provider: process.env.VANTA_PROVIDER ?? "unknown",
    model: setup.provider.modelId(),
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    agent: "interactive",
    goal: activeGoalId,
  });
  maybeHaltOnBudgetCap(deps, cost ?? 0);
}

// VANTA-COST-GUARD: the session cap now WARNS as it nears the ceiling and HALTS
// using the next-turn estimate (last turn's cost) so it stops BEFORE the turn
// that would cross — not only after. No-op when no cap is set (byte-identical).
function maybeHaltOnBudgetCap(deps: TurnDeps, lastCost: number): void {
  const cap = resolveSessionCap(process.env);
  if (cap === null) return;
  const spent = deps.state.sessionCost?.frontierUsd ?? 0;
  const budget: Budget = { scope: "session", limitUsd: cap, warnFraction: DEFAULT_WARN_FRACTION, spentUsd: spent, status: statusFor(spent, cap, DEFAULT_WARN_FRACTION), updatedAt: "" };
  const decision = guardBeforeTurn(budget, lastCost);
  if (decision.action === "warn") return void console.log(`  ${decision.message}`);
  if (decision.action === "allow") return;
  console.log(`\n${decision.message}`);
  if (deps.capHaltedRef) deps.capHaltedRef.current = true;
}

async function handleAutoHandoff(
  outcome: Awaited<ReturnType<ConvoRef["send"]>>,
  deps: TurnDeps,
): Promise<void> {
  const { convo, setup, state, repoRoot, autoHandoffNotedRef } = deps;
  const ah = await maybeAutoHandoff({
    estTokens: outcome.usage?.inputTokens ?? Math.round(convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0) / 4),
    contextWindow: setup.provider.contextWindow(),
    messages: convo.messages,
    sessionId: state.sessionId,
    provider: process.env.VANTA_PROVIDER ?? "unknown",
    model: setup.provider.modelId(),
    repoRoot,
    safety: setup.safety,
    now: new Date(),
  });
  if (ah.wrote && !autoHandoffNotedRef.current) {
    console.log(`\n  ↻ context filling up — saved a resume block to ${ah.path} (auto-reloads next launch)`);
    autoHandoffNotedRef.current = true;
  }
}

/**
 * VANTA-CONTEXT-UPGRADE: when context usage nears the active model's window AND
 * the model isn't already an extended-context variant, surface a one-line
 * non-blocking suggestion to switch to a 1M-context model — at most once per
 * session. Below the threshold = no output (pure check, no behavior change).
 */
function maybeSuggestContextUpgrade(
  outcome: Awaited<ReturnType<ConvoRef["send"]>>,
  deps: TurnDeps,
): void {
  if (deps.contextUpgradeNotedRef?.current) return;
  const { convo, setup } = deps;
  const used = outcome.usage?.inputTokens
    ?? Math.round(convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0) / 4);
  const modelId = setup.provider.modelId();
  if (!shouldSuggestContextUpgrade(used, setup.provider.contextWindow(), modelId, process.env)) return;
  console.log(`\n  ${buildContextUpgradeNote(modelId)}`);
  if (deps.contextUpgradeNotedRef) deps.contextUpgradeNotedRef.current = true;
}

/** Resolve the hook-run deps for a turn: agent-backed when available, else the
 * setup provider as the prompt provider. Shared by the loop + the stop hook. */
export function turnHookDeps(deps: TurnDeps): HookRunDeps {
  const onStatus = (m: string) => console.log(m);
  return deps.agentDeps
    ? buildAgentHookDeps(deps.agentDeps, onStatus)
    : { promptProvider: deps.setup.provider, onStatus };
}
