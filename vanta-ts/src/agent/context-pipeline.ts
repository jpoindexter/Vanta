import type { Message } from "../types.js";
import type { LLMProvider } from "../providers/interface.js";
import { compactConversation, type Summarizer } from "../context.js";
import { clearStaleToolResults, resolveIdleConfig } from "../context/time-microcompact.js";
import { graduatedCompaction } from "../context/graduated-compaction.js";
import { recordCompactedEdits, runPostCompactRestore } from "../compress/post-compact-restore.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { resolveSessionMemoryCompact, compactToSessionMemory } from "../memory/session-memory-compact.js";
import type { SessionWorkingMemory } from "../memory/working.js";
import { maskStaleToolOutputs, resolveObservationMaskKeep } from "./observation-mask.js";
import { passSavings, shouldCompact } from "../context/compaction-boundary.js";
import { join } from "node:path";

// The per-call + per-turn context-window management for the agent loop, kept out
// of agent.ts so runTurn stays focused on iteration. `ContextDeps` is the minimal
// structural shape (AgentDeps satisfies it) — avoids a circular import on AgentDeps.

export type ContextDeps = {
  provider: LLMProvider;
  root: string;
  summarize?: Summarizer;
  onAutoCompact?: (dropped: number, summary: string) => void;
  onCompacting?: (active: boolean) => void;
  activeGoalText?: string;
  /** The live session scratchpad, re-injected on compaction. */
  sessionMemory?: string;
  workingMemory?: SessionWorkingMemory;
  /** Current tool schemas — used by countTokens for an accurate pre-call count. */
  currentTools?: import("../providers/interface.js").ToolSchema[];
};

const RESTORE_MARKER = "<!-- vanta-post-compact-restore -->";

/** Per-conversation last-turn time (GC-safe; keyed by the stable messages array). */
const lastTurnAt = new WeakMap<Message[], number>();

/**
 * Per-conversation compaction-savings history (GC-safe; keyed by the stable
 * messages array — same pattern as `lastTurnAt`). Newest savings last. Feeds the
 * anti-thrash gate so a pass is skipped once the last `window` passes each saved
 * less than the floor. Bounded to the gate window so it never grows.
 */
const savingsHistory = new WeakMap<Message[], number[]>();
const SAVINGS_HISTORY_MAX = 4;

type HeadroomEpisode = {
  strikes: number;
  awaitingRealPrompt: boolean;
  triggerRatio: number;
  suppressed: boolean;
};

/** Real provider readings outrank estimated message savings for auto-compaction. */
const headroomEpisodes = new WeakMap<Message[], HeadroomEpisode>();

function episode(messages: Message[], triggerPct = 75): HeadroomEpisode {
  const current = headroomEpisodes.get(messages);
  if (current) return current;
  const created = { strikes: 0, awaitingRealPrompt: false, triggerRatio: triggerPct / 100, suppressed: false };
  headroomEpisodes.set(messages, created);
  return created;
}

function recordIneffectivePass(messages: Message[], triggerPct: number): void {
  const state = episode(messages, triggerPct);
  state.triggerRatio = triggerPct / 100;
  state.awaitingRealPrompt = false;
  state.strikes++;
  state.suppressed = state.strikes >= 2;
}

/**
 * Feed the actual input-token count for the provider call after compaction.
 * A below-trigger reading restores headroom and resets the episode. High usage
 * counts as a strike only when a preceding compaction pass awaits evaluation.
 */
export function recordRealPromptCount(messages: Message[], inputTokens: number, contextWindow: number): void {
  if (!Number.isFinite(inputTokens) || inputTokens <= 0 || contextWindow <= 0) return;
  const state = headroomEpisodes.get(messages);
  if (!state) return;
  if (inputTokens / contextWindow < state.triggerRatio) {
    state.strikes = 0;
    state.awaitingRealPrompt = false;
    state.suppressed = false;
    return;
  }
  if (!state.awaitingRealPrompt) return;
  state.awaitingRealPrompt = false;
  state.strikes++;
  state.suppressed = state.strikes >= 2;
}

/** Record one pass's savings against the conversation, bounded to a small ring. */
function recordPassSavings(messages: Message[], beforeTokens: number, afterTokens: number): void {
  const history = savingsHistory.get(messages) ?? [];
  history.push(passSavings(beforeTokens, afterTokens));
  savingsHistory.set(messages, history.slice(-SAVINGS_HISTORY_MAX));
}

/** Test-only: forget a conversation's compaction-savings history (resets the gate). */
export function resetSavingsHistory(messages: Message[]): void {
  savingsHistory.delete(messages);
  headroomEpisodes.delete(messages);
}

/** Auto-compact threshold (% of window) from env, or undefined for the default. */
export function resolveCompactThresholdPct(env: NodeJS.ProcessEnv): number | undefined {
  return env.VANTA_AUTO_COMPACT_THRESHOLD ? Math.round(Number(env.VANTA_AUTO_COMPACT_THRESHOLD) * 100) : undefined;
}

/**
 * Persistent auto-compaction: shrink the STORED conversation in place when it
 * grows past the threshold, so context actually drops between turns (the in-loop
 * compress only compacts the per-call copy). Best-effort; fires onAutoCompact.
 */
export async function persistCompaction(messages: Message[], deps: ContextDeps): Promise<void> {
  if (!deps.summarize) return;
  let compacting = false;
  try {
    const r = await compactConversation(messages, deps.provider.contextWindow(), deps.summarize, {
      thresholdPct: resolveCompactThresholdPct(process.env),
      onPreCompact: (middle) => {
        compacting = true;
        deps.onCompacting?.(true);
        return preCompact(deps, middle);
      },
    });
    if (r.compacted) {
      recordCompactedEdits(deps.workingMemory, r.compactedWindow);
      const restore = await runPostCompactRestore({
        root: deps.root,
        workingMemory: deps.workingMemory,
        env: process.env,
      });
      messages.splice(0, messages.length, ...withRestore(r.messages, restore));
      deps.onAutoCompact?.(r.dropped, r.summary);
      await fireHooks(join(deps.root, ".vanta"), "PostCompact", { trigger: "auto", dropped: r.dropped, summary: r.summary }, { cwd: deps.root, matcherValue: "auto", promptProvider: deps.provider });
    }
  } catch { /* compaction is best-effort — a failure must never block the turn */ }
  finally {
    if (compacting) deps.onCompacting?.(false);
  }
}

/** PreCompact: fire the hook, and — when VANTA_SESSION_MEMORY_COMPACT is armed —
 * distil the dropped window into the persistent session-memory file before it is
 * summarized away (so key facts + discovered tools survive into the next session). */
async function preCompact(deps: ContextDeps, middle: Message[]): Promise<void> {
  const dataDir = join(deps.root, ".vanta");
  await fireHooks(dataDir, "PreCompact", { trigger: "auto", messages: middle.length }, { cwd: deps.root, matcherValue: "auto", promptProvider: deps.provider });
  if (resolveSessionMemoryCompact(process.env)) {
    await compactToSessionMemory({ provider: deps.provider, dataDir, window: middle, env: process.env }).catch(() => {});
  }
}

function withRestore(messages: Message[], restore: string): Message[] {
  const clean = messages.filter((m) => !(m.role === "system" && m.content.includes(RESTORE_MARKER)));
  if (!restore) return clean;
  const idx = clean.findIndex((m) => m.role !== "system");
  const insertAt = idx === -1 ? clean.length : idx;
  return [...clean.slice(0, insertAt), { role: "system" as const, content: restore }, ...clean.slice(insertAt)];
}

/** Wrap the summarizer to fire onAutoCompact when in-loop compaction triggers. */
function buildTrackedSummarizer(deps: ContextDeps): Summarizer | undefined {
  return deps.summarize && deps.onAutoCompact
    ? async (mid: Message[]) => {
        deps.onCompacting?.(true);
        try {
          const s = await deps.summarize!(mid);
          deps.onAutoCompact!(mid.length, s);
          return s;
        } finally {
          deps.onCompacting?.(false);
        }
      }
    : deps.summarize;
}

export type TurnContext = {
  idleMs: number;
  idleCfg: ReturnType<typeof resolveIdleConfig>;
  trackedSummarize?: Summarizer;
  thresholdPct?: number;
};

// COMPRESS-ON-ERROR detection + post-error compaction live in the sibling so
// runTurn/provider-call can import them; re-exported here for the original path.
export { isContextLengthError, compressAfterContextError } from "./context-length-error.js";

/** Compute one turn's context state: idle gap (then stamp), tracked summarizer, threshold. */
export function beginTurnContext(messages: Message[], deps: ContextDeps): TurnContext {
  const idleMs = Date.now() - (lastTurnAt.get(messages) ?? Number.NaN);
  lastTurnAt.set(messages, Date.now());
  return {
    idleMs,
    idleCfg: resolveIdleConfig(process.env),
    trackedSummarize: buildTrackedSummarizer(deps),
    thresholdPct: resolveCompactThresholdPct(process.env),
  };
}

/** Prepare the message list for one API call: idle-clear (iter 1) then compress/trim. */
export async function prepareCallMessages(
  messages: Message[],
  deps: ContextDeps,
  iter: number,
  tc: TurnContext,
): Promise<Message[]> {
  // Idle-clear only at the genuinely-idle turn start (time-based micro-compaction).
  const afterIdle = iter === 1 ? clearStaleToolResults(messages, tc.idleMs, tc.idleCfg) : messages;
  // Observation masking: replace stale tool outputs with a placeholder while keeping calls.
  const keepRecent = resolveObservationMaskKeep(process.env);
  const fresh = keepRecent !== undefined ? maskStaleToolOutputs(afterIdle, { keepRecent }) : afterIdle;
  // If the provider supports exact token counting, use it to tighten the compaction threshold.
  let overrideThresholdPct: number | undefined;
  let realPromptOverTrigger = false;
  if (deps.provider.countTokens && deps.currentTools) {
    try {
      const exact = await deps.provider.countTokens(fresh, deps.currentTools);
      recordRealPromptCount(messages, exact, deps.provider.contextWindow());
      const pct = Math.round((exact / deps.provider.contextWindow()) * 100);
      // Force compaction sooner when real count already exceeds 80% of window.
      if (pct >= 80) overrideThresholdPct = Math.min(pct - 5, 80);
      realPromptOverTrigger = pct >= (overrideThresholdPct ?? tc.thresholdPct ?? 75);
    } catch { /* best-effort — fall through to estimate-based threshold */ }
  }
  return gatedCompaction(messages, fresh, {
    contextWindow: deps.provider.contextWindow(),
    summarize: tc.trackedSummarize,
    activeGoalText: deps.activeGoalText,
    sessionMemory: deps.sessionMemory,
    thresholdPct: overrideThresholdPct ?? tc.thresholdPct,
  }, realPromptOverTrigger);
}

/**
 * Run one graduated-compaction pass UNLESS the anti-thrash gate says to skip it.
 * `shouldCompact` returns true until the last two passes each saved <10% (a full
 * low-savings window), so healthy savings keep the prior behavior unchanged: the
 * pass runs and its savings are recorded for the next decision. `convo` is the
 * stable base array used as the savings-history key (the same key `lastTurnAt`
 * uses); `fresh` is the per-call shaped copy actually passed to the compactor.
 */
async function gatedCompaction(
  convo: Message[],
  fresh: Message[],
  opts: Parameters<typeof graduatedCompaction>[1],
  realPromptOverTrigger = false,
): Promise<Message[]> {
  const headroom = headroomEpisodes.get(convo);
  if (headroom?.suppressed) return fresh;
  if (!shouldCompact({ recentSavings: savingsHistory.get(convo) ?? [] })) return fresh;
  const result = await graduatedCompaction(fresh, opts);
  const triggerPct = opts.thresholdPct ?? 75;
  const attempted = realPromptOverTrigger || result.beforeTokens >= opts.contextWindow * (triggerPct / 100);
  if (!attempted) return result.messages;
  recordPassSavings(convo, result.beforeTokens, result.afterTokens);
  if (result.layers.length === 0 || result.afterTokens >= result.beforeTokens) {
    recordIneffectivePass(convo, triggerPct);
  } else {
    const state = episode(convo, triggerPct);
    state.triggerRatio = triggerPct / 100;
    state.awaitingRealPrompt = true;
  }
  return result.messages;
}
