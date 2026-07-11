import { join } from "node:path";
import { shouldReview } from "../review/background-review.js";
import { runLearningCycle, defaultLearningDeps, formatCycleNote } from "../learning/loop.js";
import { shouldUpdateSessionMemory, updateSessionMemory } from "../memory/session-memory.js";
import { runMemoryExtractor } from "../memory/extractor.js";
import { runDialecticPass, type DialecticResult } from "../operator-profile/dialectic.js";
import { shouldLearn, learnFromTranscript } from "../brain/learn.js";
import { scoreTurn, formatCriticNote } from "../observe/critic.js";
import { runCompletionVerifier, shouldVerifyCompletion } from "../verify/completion-verifier.js";
import type { KernelClient } from "../kernel/client.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

// The post-turn background forks that grow or check Vanta from a finished turn:
// skill capture, session scratchpad, opt-in fact extraction, durable brain
// memories, completion verification, and critic scoring. Each is gated and
// best-effort: a failure never touches the main turn. Split from after-turn.ts
// (size budget); re-exported there, so the public surface is unchanged.

const CHOICE_REQUEST = /\b(?:choose|pick|select|confirm|approve|reply(?:\s+with)?|tell\s+me\s+which)\b/i;
const DEFERRED_ACTION = /(?:\b(?:i\s+)?(?:won't|will\s+not|don't|do\s+not)\b[^.!?\n]{0,80}\b(?:start|act|proceed|execute|change|write|send)\b|\b(?:start|act|proceed|execute|change|write|send)\b[^.!?\n]{0,50}\b(?:only\s+after|until)\b[^.!?\n]{0,50}\b(?:you\s+)?(?:choose|pick|select|confirm|approve|reply)\b|\b(?:wait|hold)\b[^.!?\n]{0,80}\b(?:choice|selection|confirmation|you\s+(?:choose|pick|select|confirm|approve|reply))\b|\bbefore\s+i\s+(?:start|act|proceed|execute|change|write|send)\b)/i;

/** True only when the assistant explicitly asks for a choice and promises not
 * to act before it arrives. Used to stop mutating post-turn learning hooks. */
export function isExplicitChoiceWall(finalText: string): boolean {
  const normalized = finalText.replace(/[’]/g, "'").trim();
  return CHOICE_REQUEST.test(normalized) && DEFERRED_ACTION.test(normalized);
}

export type ReviewAfterTurnResult = "deferred" | "reviewed" | "skipped";

/**
 * Post-turn self-improvement nudge. When the turn warrants review (busy turn or
 * the periodic interval — see {@link shouldReview}), spawn the background-review
 * fork to capture a skill. Best-effort and quiet unless something was learned.
 */
export async function reviewAfterTurn(opts: {
  provider: LLMProvider;
  safety: KernelClient;
  root: string;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
  deferMutation?: boolean;
}): Promise<ReviewAfterTurnResult> {
  const env = opts.env ?? process.env;
  let reviewStatus: ReviewAfterTurnResult = opts.deferMutation ? "deferred" : "skipped";
  if (!opts.deferMutation && shouldReview(opts.toolIterations, opts.turnIndex, env)) {
    // VANTA-SELF-LEARNING-LOOP: the named closed loop — propose (reviewTurn) →
    // eval-gate → adopt-or-archive → measure (ledger). On by default, gated.
    const cycle = await runLearningCycle(
      defaultLearningDeps({
        provider: opts.provider,
        safety: opts.safety,
        root: opts.root,
        dataDir: join(opts.root, ".vanta"),
        transcript: opts.transcript,
        env,
      }),
    );
    const note = formatCycleNote(cycle);
    if (note) console.log(note);
    reviewStatus = "reviewed";
  }
  completionVerifierAfterTurn({
    provider: opts.provider,
    safety: opts.safety,
    transcript: opts.transcript,
    env,
  });
  return reviewStatus;
}

/**
 * Built-in completion verifier. Opt-in via VANTA_VERIFY=1. Fork/fire: it never
 * blocks the turn that just finished. A failing verdict is appended as a system
 * message so the next model turn sees it; passing verdicts only hit events.
 */
export function completionVerifierAfterTurn(opts: {
  provider: LLMProvider;
  safety: KernelClient;
  transcript: Message[];
  env?: NodeJS.ProcessEnv;
}): void {
  const env = opts.env ?? process.env;
  if (!shouldVerifyCompletion({ messages: opts.transcript }, env)) return;
  void runVerifierFork(opts, env);
}

async function runVerifierFork(
  opts: { provider: LLMProvider; safety: KernelClient; transcript: Message[] },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    const goals = await opts.safety.getGoals().catch(() => []);
    const result = await runCompletionVerifier({
      messages: opts.transcript,
    }, {
      provider: opts.provider,
      goals,
      env,
      logEvent: (event) => opts.safety.logEvent(event),
    });
    await opts.safety.logEvent(`completion_verifier:${result.verdict}:${result.evidence}`);
    if (result.verdict === "fail") {
      opts.transcript.push({ role: "system", content: `⚠ Verifier: ${result.evidence}` });
    }
  } catch {
    await opts.safety.logEvent("completion_verifier: failed/discarded").catch(() => {});
  }
}

/**
 * Post-turn, distil the running transcript into .vanta/session-memory.md when
 * the turn warrants it (busy turn or the periodic interval — see
 * {@link shouldUpdateSessionMemory}). Returns the new scratchpad content so the
 * host can refresh the live compaction injection, or null when no update ran.
 * Best-effort and silent.
 */
export async function sessionMemoryAfterTurn(opts: {
  provider: LLMProvider;
  dataDir: string;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = opts.env ?? process.env;
  if (!shouldUpdateSessionMemory(opts.turnIndex, opts.toolIterations, env)) return null;
  const { updated, content } = await updateSessionMemory({
    provider: opts.provider,
    dataDir: opts.dataDir,
    transcript: opts.transcript,
    env,
  });
  return updated ? content ?? null : null;
}

/**
 * Post-turn brain learning: when the turn warrants it (busy turn or the periodic
 * interval — see {@link shouldLearn}), distil the transcript into 0–3 durable
 * memories (user patterns → user_model, facts → semantic, Vanta's own forming
 * personality → identity/reflections). Returns what was learned so the host can
 * surface it its own way (console line vs TUI note). Best-effort and silent.
 */
export async function brainLearnAfterTurn(opts: {
  provider: LLMProvider;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  const env = opts.env ?? process.env;
  if (!shouldLearn(opts.turnIndex, opts.toolIterations, env)) return [];
  return learnFromTranscript({ provider: opts.provider, transcript: opts.transcript, env });
}

/**
 * Explicit operator-model pass. Direct preferences are captured without an LLM;
 * corrections and periodic pattern checks use the provider. The pass is gated,
 * provenance-tagged, and never allowed to break the completed turn.
 */
export async function dialecticAfterTurn(opts: {
  provider: LLMProvider;
  transcript: Message[];
  sessionId: string;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<DialecticResult> {
  try {
    return await runDialecticPass(opts);
  } catch {
    return { ran: true, changed: [], reason: "failed" };
  }
}

/**
 * Separate opt-in post-turn memory extraction fork. It returns immediately so
 * the main loop never waits on extraction; the extractor itself has a 20s hard
 * deadline and swallows all failures.
 */
export function memoryExtractAfterTurn(opts: {
  provider: LLMProvider;
  transcript: Message[];
  env?: NodeJS.ProcessEnv;
}): void {
  const env = opts.env ?? process.env;
  if (env.VANTA_EXTRACT_MEMORIES !== "1") return;
  void runMemoryExtractor(opts.transcript, { provider: opts.provider, env }).catch(() => {});
}

/**
 * Independent critic pass (PAPER-OBSERVABILITY). Scores the last turn with a
 * separate LLM call — generator/evaluator separation. Opt-in: VANTA_CRITIC=1.
 * Only fires when the turn used substantive tool calls. Best-effort and silent.
 */
export async function criticAfterTurn(opts: {
  provider: LLMProvider;
  goal: string;
  messages: Message[];
  onNote: (text: string) => void;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = opts.env ?? process.env;
  if (env.VANTA_CRITIC !== "1") return;
  try {
    const score = await scoreTurn({ provider: opts.provider, goal: opts.goal, messages: opts.messages, env });
    if (score) opts.onNote(formatCriticNote(score));
  } catch { /* best-effort — never surface a critic failure to the user */ }
}
