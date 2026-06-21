// Auto-dream — the periodic background memory-consolidation trigger. A "dream"
// is one brain sleep pass (the existing `consolidate`). This service decides
// WHEN to run one across sessions, without a manual trigger: due when enabled
// AND enough wall-clock has passed since the last dream AND enough new memories
// have accumulated since then. Pure decision + state bookkeeping; the actual
// consolidation is the injected brain pass. Off by default → current behavior.
//
// Wiring point (NOT wired this round, mirroring proactive's clarity-gate): the
// gateway heartbeat (`gateway/run.ts gatewayTick`) or a cron task would, once per
// tick, call `runDreamIfDue` with `consolidate` from `brain/consolidate.ts` and a
// persisted `DreamState` (e.g. `.vanta/dream.json`), incrementing
// `memoriesSinceLastDream` whenever the brain learns a new memory.

/** Cross-session dream bookkeeping: when we last consolidated + new memories since. */
export type DreamState = { lastDreamMs: number; memoriesSinceLastDream: number };

/** Auto-dream throttle. Disabled by default so nothing runs without opt-in. */
export type DreamConfig = { enabled: boolean; intervalMs: number; minNewMemories: number };

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h between dreams
const DEFAULT_MIN_NEW_MEMORIES = 10; // wait for this much new material before consolidating

/** A clean starting dream state (never dreamed, nothing accumulated). */
export function newDreamState(): DreamState {
  return { lastDreamMs: 0, memoriesSinceLastDream: 0 };
}

/** Read auto-dream config from env. Defaults = DISABLED (current behavior unchanged). */
export function resolveDreamConfig(env: NodeJS.ProcessEnv = process.env): DreamConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    enabled: env.VANTA_AUTO_DREAM === "1",
    intervalMs: num(env.VANTA_DREAM_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    minNewMemories: Math.trunc(num(env.VANTA_DREAM_MIN_MEMORIES, DEFAULT_MIN_NEW_MEMORIES)),
  };
}

/** True when a dream is due: enabled, the interval has elapsed, and enough new memories piled up. */
export function shouldDream(state: DreamState, nowMs: number, config: DreamConfig): boolean {
  if (!config.enabled) return false;
  if (nowMs - state.lastDreamMs < config.intervalMs) return false;
  return state.memoriesSinceLastDream >= config.minNewMemories;
}

/** Record a completed dream: stamp the time and clear the new-memory counter. Pure. */
export function recordDream(state: DreamState, nowMs: number): DreamState {
  return { lastDreamMs: nowMs, memoriesSinceLastDream: 0 };
}

/** Accumulate `n` newly-formed memories toward the next dream. Pure; negative counts ignored. */
export function recordNewMemories(state: DreamState, n: number): DreamState {
  const add = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  return { ...state, memoriesSinceLastDream: state.memoriesSinceLastDream + add };
}

export type DreamDeps = {
  getState: () => Promise<DreamState>;
  saveState: (state: DreamState) => Promise<void>;
  now: () => number;
  /** The brain sleep pass (e.g. `consolidate` from brain/consolidate.ts). */
  consolidate: () => Promise<unknown>;
  config: DreamConfig;
};

/**
 * Run the consolidation pass only when a dream is due, then record it. Best-effort:
 * a `consolidate` failure leaves state untouched and never throws — `dreamed:false`.
 */
export async function runDreamIfDue(deps: DreamDeps): Promise<{ dreamed: boolean }> {
  try {
    const state = await deps.getState();
    const nowMs = deps.now();
    if (!shouldDream(state, nowMs, deps.config)) return { dreamed: false };
    await deps.consolidate();
    await deps.saveState(recordDream(state, nowMs));
    return { dreamed: true };
  } catch {
    return { dreamed: false }; // best-effort: never let a consolidate failure break the caller
  }
}
