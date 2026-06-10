import type { Message } from "../types.js";
import type { LLMProvider } from "../providers/interface.js";
import { compressMessages, trimMessages, compactConversation, type Summarizer } from "../context.js";
import { clearStaleToolResults, resolveIdleConfig } from "../context/time-microcompact.js";

// The per-call + per-turn context-window management for the agent loop, kept out
// of agent.ts so runTurn stays focused on iteration. `ContextDeps` is the minimal
// structural shape (AgentDeps satisfies it) — avoids a circular import on AgentDeps.

export type ContextDeps = {
  provider: LLMProvider;
  summarize?: Summarizer;
  onAutoCompact?: (dropped: number, summary: string) => void;
  activeGoalText?: string;
};

/** Per-conversation last-turn time (GC-safe; keyed by the stable messages array). */
const lastTurnAt = new WeakMap<Message[], number>();

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
  try {
    const r = await compactConversation(messages, deps.provider.contextWindow(), deps.summarize, {
      thresholdPct: resolveCompactThresholdPct(process.env),
    });
    if (r.compacted) {
      messages.splice(0, messages.length, ...r.messages);
      deps.onAutoCompact?.(r.dropped, r.summary);
    }
  } catch { /* compaction is best-effort — a failure must never block the turn */ }
}

/** Wrap the summarizer to fire onAutoCompact when in-loop compaction triggers. */
function buildTrackedSummarizer(deps: ContextDeps): Summarizer | undefined {
  return deps.summarize && deps.onAutoCompact
    ? async (mid: Message[]) => {
        const s = await deps.summarize!(mid);
        deps.onAutoCompact!(mid.length, s);
        return s;
      }
    : deps.summarize;
}

export type TurnContext = {
  idleMs: number;
  idleCfg: ReturnType<typeof resolveIdleConfig>;
  trackedSummarize?: Summarizer;
  thresholdPct?: number;
};

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
  // Idle-clear only at the genuinely-idle turn start (CC-TIME-BASED-MC).
  const fresh = iter === 1 ? clearStaleToolResults(messages, tc.idleMs, tc.idleCfg) : messages;
  return tc.trackedSummarize
    ? compressMessages(fresh, deps.provider.contextWindow(), tc.trackedSummarize, { activeGoalText: deps.activeGoalText, thresholdPct: tc.thresholdPct })
    : trimMessages(fresh, deps.provider.contextWindow(), { thresholdPct: tc.thresholdPct });
}
