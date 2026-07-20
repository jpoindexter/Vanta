/**
 * interactive-turn.ts — per-turn helpers for the REPL (extracted from interactive.ts
 * to satisfy the file/function size gate). No public API beyond what interactive.ts needs.
 */
import { join } from "node:path";
import { maybeDroppedImage, maybeDroppedVideo, splitPastedImagePaths, looksLikeTempImagePath } from "./repl-commands.js";
import { readClipboardImage } from "./term/clipboard-image.js";
import { activeImageAttachments } from "./vision/capture-expiry.js";
import { buildModeHint } from "./repl/mode-detect.js";
import { buildAgentRouteHint } from "./repl/agent-route.js";
import { maybeAugmentPrompt } from "./templates/templates.js";
import type { GateState } from "./repl/post-turn-gates.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "./repl/complexity-gate.js";
import { scoreClarity, shouldClarify, resolveClarityThreshold, buildClarityNote } from "./repl/clarity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "./repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "./repl/closure-gate.js";
import { buildGoalLoopMax } from "./repl/goal-condition.js";
import { fireHooks } from "./hooks/shell-hooks.js";
import { runPostTurnPipeline, turnHookDeps } from "./interactive-post-turn.js";
import type { ReplState } from "./repl-commands.js";
import type { RunSetup } from "./session.js";
import type { SessionWorkingMemory } from "./memory/working.js";
import type { AgentDeps, createConversation } from "./agent.js";

export { runPostTurnPipeline } from "./interactive-post-turn.js";
export type { PostTurnOpts } from "./interactive-post-turn.js";

type ConvoRef = ReturnType<typeof createConversation>;

export type TurnDeps = {
  convo: ConvoRef;
  setup: RunSetup;
  state: ReplState;
  repoRoot: string;
  workingMemory: SessionWorkingMemory;
  agentDeps?: AgentDeps;
  autoHandoffNotedRef: { current: boolean };
  /** VANTA-CONTEXT-UPGRADE: one-time guard so the extended-context suggestion
   * surfaces at most once per session (mirrors autoHandoffNotedRef). */
  contextUpgradeNotedRef?: { current: boolean };
  gatesRef: { current: GateState };
  /** VANTA-BUDGET-CAP: set true once accumulated spend reaches --max-budget-usd,
   * so the REPL loop stops the session cleanly after the current turn. */
  capHaltedRef?: { current: boolean };
};

/** Resolve media drops and normalize text; mutates state.pendingImages. */
export async function resolveDroppedMedia(
  text: string,
  state: ReplState,
): Promise<{ text: string; images: ReplState["pendingImages"] }> {
  const { imagePaths, rest } = splitPastedImagePaths(text);
  if (imagePaths.length) {
    const reads = await Promise.all(imagePaths.map(maybeDroppedImage));
    const valid = reads.filter((img): img is NonNullable<typeof img> => img !== null);
    if (valid.length) {
      (state.pendingImages ??= []).push(...valid);
      text = rest || "Take a look at this image.";
    } else if (process.platform === "darwin" && looksLikeTempImagePath(text)) {
      // The path was a temp preview that's already gone — its bytes are still on
      // the clipboard, so read them directly.
      const clip = await readClipboardImage();
      if (clip) {
        (state.pendingImages ??= []).push(clip);
        text = rest || "Take a look at this image.";
      }
    }
  } else {
    const videoPath = await maybeDroppedVideo(text);
    if (videoPath) text = `Watch this video and describe what you see: ${videoPath}`;
  }
  const images = activeImageAttachments(state.pendingImages);
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
  // VANTA-CLARITY-GATE — non-blocking: only a genuinely-ambiguous instruction trips it.
  if (shouldClarify(scoreClarity(text), resolveClarityThreshold(process.env))) {
    console.log(`\n${buildClarityNote(text)}`);
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

/**
 * Execute one user turn, looping automatically when the active goal has a
 * "done when `<cmd>`" condition that has not yet passed (up to VANTA_GOAL_LOOP_MAX).
 */
export async function executeUserTurn(text: string, deps: TurnDeps): Promise<void> {
  const resolved = await resolveDroppedMedia(text, deps.state);
  let turnText = resolved.text;
  let images = resolved.images;
  const loopMax = buildGoalLoopMax(process.env);
  let loopCount = 0;
  for (;;) {
    deps.state.turnIndex++;
    void fireHooks(join(deps.repoRoot, ".vanta"), "UserPromptSubmit", { prompt: turnText }, { cwd: deps.repoRoot, ...turnHookDeps(deps) });
    printPreTurnNotes(turnText, deps.convo, deps.setup);
    const turnStart = new Date().toISOString();
    const t0 = Date.now();
    const outcome = await deps.convo.send(buildSendText(turnText, deps.workingMemory), images);
    const result = await runPostTurnPipeline({ outcome, text: turnText, t0, turnStart, deps });
    deps.state.lastActionAt = new Date().toISOString(); // ND-TIME-RANGES: powers /time "since last action"
    images = undefined;
    if (deps.capHaltedRef?.current) break;
    if (!result.continueWith || loopCount >= loopMax) break;
    turnText = result.continueWith;
    loopCount++;
  }
}

/** Build the mode-aware send text (working memory prefix + mode hint). */
export function buildSendText(
  text: string,
  workingMemory: SessionWorkingMemory,
): string {
  const wmCtx = workingMemory.isEmpty() ? "" : `\n\n${workingMemory.format()}\n\n---\n\n`;
  const modeHint = process.env.VANTA_MODE_DETECT !== "0" ? buildModeHint(text) : null;
  // VANTA-AGENT-ROUTING-DISCOVERY: surface call_agent for "talk to/start another agent".
  const routeHint = process.env.VANTA_AGENT_ROUTE !== "0" ? buildAgentRouteHint(text) : null;
  const prefix = `${routeHint ? `${routeHint}\n\n` : ""}${modeHint ? `${modeHint}\n\n` : ""}${wmCtx}`;
  return `${prefix}${maybeAugmentPrompt(text)}`;
}
