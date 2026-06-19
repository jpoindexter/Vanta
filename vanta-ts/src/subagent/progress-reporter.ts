import type { LLMProvider } from "../providers/interface.js";
import { progressStore } from "./progress-store.js";
import { dueForUpdate, specificHint, SUMMARY_INTERVAL_MS, toSummary, type RecentCall } from "./progress.js";

// VANTA-AGENT-SUMMARY — the forked side-query that keeps a running sub-agent's
// footer pill live. Mirrors the post-turn background forks (gated, best-effort,
// provider injected): it reuses the PARENT's provider so it shares that context
// path and bills no extra key, throttles to ~30s, and on any failure leaves the
// last summary untouched — it must never break the worker's run.

const SUMMARY_SYS =
  "You write a 3-5 word, present-tense status for a running coding agent — name the " +
  "specific file, symbol, or action it is on (e.g. 'Editing auth.ts', 'Running test suite'). " +
  "No quotes, no period, no preamble. Reply with the phrase only.";

function isDisabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_SUBAGENT_PROGRESS ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function buildPrompt(goal: string, calls: RecentCall[]): string {
  const recent = calls.slice(-5).map((c) => `${c.name}(${Object.values(c.args)[0] ?? ""})`).join(", ");
  return `Goal: ${goal.slice(0, 200)}\nRecent tool calls: ${recent || "(none yet)"}\nStatus phrase:`;
}

export type TickOpts = {
  id: string;
  goal: string;
  provider: LLMProvider;
  getRecentCalls: () => RecentCall[];
  now?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Run one progress refresh: if the throttle is due, fork a side-query, format
 * the reply (falling back to the specific tool-call hint), and write the store.
 * Returns true when it wrote, false when throttled or it failed quietly.
 */
export async function runProgressTick(opts: TickOpts): Promise<boolean> {
  const env = opts.env ?? process.env;
  if (isDisabled(env)) return false;
  const now = opts.now ?? Date.now();
  const last = progressStore().snapshot().find((p) => p.id === opts.id)?.updatedAt ?? null;
  if (!dueForUpdate(last, now)) return false;

  const calls = opts.getRecentCalls();
  const hint = specificHint(calls);
  try {
    const { text } = await opts.provider.complete(
      [{ role: "system", content: SUMMARY_SYS }, { role: "user", content: buildPrompt(opts.goal, calls) }],
      [],
    );
    progressStore().setSummary(opts.id, toSummary(text, hint), now);
    return true;
  } catch {
    // Best-effort: keep the last summary. Only seed one from the hint if we have
    // nothing yet, so a failing model still shows a specific pill on first tick.
    if (last === null && hint) progressStore().setSummary(opts.id, toSummary("", hint), now);
    return false;
  }
}

export type ReporterOpts = {
  id: string;
  goal: string;
  provider: LLMProvider;
  getRecentCalls: () => RecentCall[];
  intervalMs?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Register a running sub-agent and start ticking its summary on an interval.
 * Returns a stop fn that clears the interval and removes the pill. No-op (still
 * returns a stop fn) when disabled, so callers wire it unconditionally.
 */
export function startProgressReporter(opts: ReporterOpts): () => void {
  const env = opts.env ?? process.env;
  progressStore().register(opts.id, opts.goal);
  if (isDisabled(env)) return () => progressStore().clear(opts.id);

  const tick = (): void => {
    void runProgressTick({ id: opts.id, goal: opts.goal, provider: opts.provider, getRecentCalls: opts.getRecentCalls, env });
  };
  // No eager first tick: a worker that finishes inside one interval bills no
  // side-query. The pill still shows immediately (title-only via register); the
  // first summary lands at the first ~30s boundary for genuinely long workers.
  const timer = setInterval(tick, opts.intervalMs ?? SUMMARY_INTERVAL_MS);
  timer.unref?.(); // never keep the process alive for the pill
  return () => {
    clearInterval(timer);
    progressStore().clear(opts.id);
  };
}
