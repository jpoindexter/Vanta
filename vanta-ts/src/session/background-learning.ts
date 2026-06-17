import { reviewTurn, shouldReview } from "../review/background-review.js";
import { shouldUpdateSessionMemory, updateSessionMemory } from "../memory/session-memory.js";
import { runMemoryExtractor } from "../memory/extractor.js";
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
}): Promise<void> {
  const env = opts.env ?? process.env;
  if (shouldReview(opts.toolIterations, opts.turnIndex, env)) {
    const { wrote } = await reviewTurn({
      provider: opts.provider,
      safety: opts.safety,
      root: opts.root,
      transcript: opts.transcript,
    });
    if (wrote.length) console.log(`  ▸ self-improvement: learned ${wrote.join(", ")}`);
  }
  completionVerifierAfterTurn({
    provider: opts.provider,
    safety: opts.safety,
    transcript: opts.transcript,
    env,
  });
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
