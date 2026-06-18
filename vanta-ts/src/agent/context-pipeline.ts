import type { Message } from "../types.js";
import type { LLMProvider } from "../providers/interface.js";
import { compactConversation, type Summarizer } from "../context.js";
import { clearStaleToolResults, resolveIdleConfig } from "../context/time-microcompact.js";
import { graduatedCompaction } from "../context/graduated-compaction.js";
import { recordCompactedEdits, runPostCompactRestore } from "../compress/post-compact-restore.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { SessionWorkingMemory } from "../memory/working.js";
import { maskStaleToolOutputs, resolveObservationMaskKeep } from "./observation-mask.js";
import { join } from "node:path";

// The per-call + per-turn context-window management for the agent loop, kept out
// of agent.ts so runTurn stays focused on iteration. `ContextDeps` is the minimal
// structural shape (AgentDeps satisfies it) — avoids a circular import on AgentDeps.

export type ContextDeps = {
  provider: LLMProvider;
  root: string;
  summarize?: Summarizer;
  onAutoCompact?: (dropped: number, summary: string) => void;
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
      onPreCompact: (middle) => fireHooks(join(deps.root, ".vanta"), "PreCompact", { trigger: "auto", messages: middle.length }, { cwd: deps.root, matcherValue: "auto", promptProvider: deps.provider }),
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
  // Idle-clear only at the genuinely-idle turn start (time-based micro-compaction).
  const afterIdle = iter === 1 ? clearStaleToolResults(messages, tc.idleMs, tc.idleCfg) : messages;
  // Observation masking: replace stale tool outputs with a placeholder while keeping calls.
  const keepRecent = resolveObservationMaskKeep(process.env);
  const fresh = keepRecent !== undefined ? maskStaleToolOutputs(afterIdle, { keepRecent }) : afterIdle;
  // If the provider supports exact token counting, use it to tighten the compaction threshold.
  let overrideThresholdPct: number | undefined;
  if (deps.provider.countTokens && deps.currentTools) {
    try {
      const exact = await deps.provider.countTokens(fresh, deps.currentTools);
      const pct = Math.round((exact / deps.provider.contextWindow()) * 100);
      // Force compaction sooner when real count already exceeds 80% of window.
      if (pct >= 80) overrideThresholdPct = Math.min(pct - 5, 80);
    } catch { /* best-effort — fall through to estimate-based threshold */ }
  }
  const result = await graduatedCompaction(fresh, {
    contextWindow: deps.provider.contextWindow(),
    summarize: tc.trackedSummarize,
    activeGoalText: deps.activeGoalText,
    sessionMemory: deps.sessionMemory,
    thresholdPct: overrideThresholdPct ?? tc.thresholdPct,
  });
  return result.messages;
}
