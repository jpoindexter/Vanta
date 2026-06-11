/**
 * interactive-turn.ts — per-turn helpers for the REPL (extracted from interactive.ts
 * to satisfy the file/function size gate). No public API beyond what interactive.ts needs.
 */
import { join } from "node:path";
import { maybeDroppedImage, maybeDroppedVideo } from "./repl-commands.js";
import { estimateCostUsd, addTurnCost, formatTurnCost } from "./pricing.js";
import { buildModeHint } from "./repl/mode-detect.js";
import { maybeAutoHandoff } from "./repl/auto-handoff.js";
import { pruneVolatileSkills } from "./skills/volatile.js";
import {
  writeRunMemory,
  reviewAfterTurn,
  sessionMemoryAfterTurn,
  brainLearnAfterTurn,
  antiSlopAfterText,
} from "./session.js";
import { runPostTurnGates, type GateState } from "./repl/post-turn-gates.js";
import { suggestSkillFromRun } from "./projects/commands.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "./repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "./repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "./repl/closure-gate.js";
import { saveSession } from "./sessions/store.js";
import { reflectAfterTurn } from "./repl/reflect-correct.js";
import type { ReplState } from "./repl-commands.js";
import type { RunSetup } from "./session.js";
import type { SessionWorkingMemory } from "./memory/working.js";
import type { createConversation } from "./agent.js";

type ConvoRef = ReturnType<typeof createConversation>;

export type TurnDeps = {
  convo: ConvoRef;
  setup: RunSetup;
  state: ReplState;
  repoRoot: string;
  workingMemory: SessionWorkingMemory;
  autoHandoffNotedRef: { current: boolean };
  gatesRef: { current: GateState };
};

/** Resolve media drops and normalize text; mutates state.pendingImages. */
export async function resolveDroppedMedia(
  text: string,
  state: ReplState,
): Promise<{ text: string; images: ReplState["pendingImages"] }> {
  const dropped = await maybeDroppedImage(text);
  if (dropped) {
    (state.pendingImages ??= []).push(dropped);
    text = "Take a look at this image.";
  } else {
    const videoPath = await maybeDroppedVideo(text);
    if (videoPath) text = `Watch this video and describe what you see: ${videoPath}`;
  }
  const images = state.pendingImages;
  state.pendingImages = undefined;
  return { text, images };
}

/** Print pre-turn notes: complexity gate + topic-shift + closure-gate. */
export function printPreTurnNotes(
  text: string,
  convo: ConvoRef,
  setup: RunSetup,
): void {
  const complexityScore = scoreComplexity(text);
  if (shouldSuggestPlanMode(complexityScore, convo.messages, process.env)) {
    console.log(`\n${buildComplexityNote(complexityScore)}`);
  }
  const activeGoal = setup.goals.find((g) => g.status === "active") ?? null;
  if (isTopicShift(text, activeGoal, 0.15)) {
    console.log(`\n${buildTopicShiftNote()}`);
    try {
      const inProgress = getInProgressItems(convo.messages);
      if (inProgress.length) console.log(`\n${buildClosureGateText(inProgress)}`);
    } catch { /* best-effort */ }
  }
}

export type PostTurnOpts = {
  outcome: Awaited<ReturnType<ConvoRef["send"]>>;
  text: string;
  t0: number;
  turnStart: string;
  deps: TurnDeps;
};

/** Post-send pipeline: cost, handoff, save, review, session memory, gates, reflect. */
export async function runPostTurnPipeline(o: PostTurnOpts): Promise<void> {
  const { outcome, text, t0, turnStart, deps } = o;
  const { convo, setup, state, repoRoot, gatesRef } = deps;
  pruneVolatileSkills(convo.messages);
  console.log(`\n${outcome.finalText}`);
  if (outcome.usage) {
    const cost = estimateCostUsd(setup.provider.modelId(), outcome.usage.inputTokens, outcome.usage.outputTokens);
    console.log(`  ${formatTurnCost({ inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, elapsedMs: Date.now() - t0, cost, tokensSaved: outcome.tokensSaved })}`);
    state.sessionCost = addTurnCost(state.sessionCost, process.env.VANTA_PROVIDER, cost, outcome.tokensSaved);
  }
  await handleAutoHandoff(outcome, deps);
  await saveSession(state.sessionId, convo.messages, { started: state.started, title: state.title }).catch(() => {});
  await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction: text, finalText: outcome.finalText, now: turnStart, sessionId: state.sessionId, turnIndex: state.turnIndex });
  await suggestSkillFromRun(text, process.env);
  await antiSlopAfterText(outcome.finalText, (note) => console.log(`\n${note}`)).catch(() => {});
  await reviewAfterTurn({ provider: setup.provider, safety: setup.safety, root: repoRoot, transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex });
  const newScratch = await sessionMemoryAfterTurn({ provider: setup.provider, dataDir: join(repoRoot, ".vanta"), transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex });
  if (newScratch) convo.setSessionMemory(newScratch);
  const learned = await brainLearnAfterTurn({ provider: setup.provider, transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: state.turnIndex });
  if (learned.length) console.log(`  🧠 learned: ${learned.map((l) => (l.length > 60 ? `${l.slice(0, 57)}…` : l)).join(" · ")}`);
  gatesRef.current = await runPostTurnGates(gatesRef.current, { messages: convo.messages, safety: setup.safety, dataDir: join(repoRoot, ".vanta"), onNote: (note) => console.log(`\n${note}`) });
  const lastUserMsg = [...convo.messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : "") : "";
  await reflectAfterTurn(lastUserText, process.env);
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

/** Build the mode-aware send text (working memory prefix + mode hint). */
export function buildSendText(
  text: string,
  workingMemory: SessionWorkingMemory,
): string {
  const wmCtx = workingMemory.isEmpty() ? "" : `\n\n${workingMemory.format()}\n\n---\n\n`;
  const modeHint = process.env.VANTA_MODE_DETECT !== "0" ? buildModeHint(text) : null;
  const prefix = `${modeHint ? `${modeHint}\n\n` : ""}${wmCtx}`;
  return `${prefix}${text}`;
}
