import { z } from "zod";

// KAIROS — focus-aware proactive heartbeat. When Vanta is idle AND the user is
// away, it may pick up queued work on its own — but only under a strict throttle:
// idle-time gate (don't interrupt a present user), cadence (min interval + a daily
// tick cap), and an economic gate that REUSES the budget hard-stop (a tripped
// budget blocks proactive work). Pure decision + state transitions only; the
// orchestrator (tick.ts) supplies the live queue count and budget verdict.

export const ProactiveConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** User must have been away ≥ this many minutes (no recorded activity). */
  minIdleMin: z.number().min(0).default(15),
  /** At least this many minutes between proactive ticks. */
  minIntervalMin: z.number().min(0).default(30),
  /** Hard cap on proactive ticks per calendar day. */
  maxPerDay: z.number().int().min(0).default(8),
  /** Budget scope whose hard-stop also gates proactive work (economic throttle). */
  budgetScope: z.string().min(1).default("session"),
});
export type ProactiveConfig = z.infer<typeof ProactiveConfigSchema>;

export const ProactiveStateSchema = z.object({
  lastUserActivityAt: z.string().nullable().default(null),
  lastTickAt: z.string().nullable().default(null),
  ticksToday: z.number().int().min(0).default(0),
  /** Calendar day (YYYY-MM-DD) the counters belong to; rolls over at a new day. */
  day: z.string().nullable().default(null),
});
export type ProactiveState = z.infer<typeof ProactiveStateSchema>;

export type TickDecision = { tick: boolean; reason: string };

export function newProactiveState(): ProactiveState {
  return ProactiveStateSchema.parse({});
}

/** Read proactive config from env (VANTA_PROACTIVE_*). Defaults = disabled. */
export function resolveProactiveConfig(env: NodeJS.ProcessEnv): ProactiveConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : d;
  };
  return ProactiveConfigSchema.parse({
    enabled: env.VANTA_PROACTIVE === "1",
    minIdleMin: num(env.VANTA_PROACTIVE_IDLE_MIN, 15),
    minIntervalMin: num(env.VANTA_PROACTIVE_INTERVAL_MIN, 30),
    maxPerDay: Math.trunc(num(env.VANTA_PROACTIVE_MAX_PER_DAY, 8)),
    budgetScope: env.VANTA_PROACTIVE_BUDGET_SCOPE || "session",
  });
}

function minutesBetween(fromIso: string | null, now: Date): number {
  if (!fromIso) return Infinity; // never recorded ⇒ treat as long ago (away)
  return (now.getTime() - new Date(fromIso).getTime()) / 60_000;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Decide whether to run one proactive tick now. Pure — every input is passed in
 * (queuedCount + budgetExceeded come from the live stores via the orchestrator).
 */
export function decideProactiveTick(opts: {
  config: ProactiveConfig;
  state: ProactiveState;
  now: Date;
  queuedCount: number;
  budgetExceeded: boolean;
}): TickDecision {
  const { config: c, state: s, now } = opts;
  if (!c.enabled) return { tick: false, reason: "proactive disabled" };
  if (opts.queuedCount <= 0) return { tick: false, reason: "no queued work" };
  if (opts.budgetExceeded) return { tick: false, reason: `budget exceeded (${c.budgetScope})` };
  const idle = minutesBetween(s.lastUserActivityAt, now);
  if (idle < c.minIdleMin) return { tick: false, reason: `user active (idle ${idle.toFixed(0)}m < ${c.minIdleMin}m)` };
  const sinceTick = minutesBetween(s.lastTickAt, now);
  if (sinceTick < c.minIntervalMin) return { tick: false, reason: `cadence (${sinceTick.toFixed(0)}m < ${c.minIntervalMin}m)` };
  const ticksToday = s.day === dayKey(now) ? s.ticksToday : 0;
  if (ticksToday >= c.maxPerDay) return { tick: false, reason: `daily cap (${ticksToday}/${c.maxPerDay})` };
  return { tick: true, reason: "ok" };
}

/** Record a completed proactive tick, rolling the daily counter on a new day. Pure. */
export function recordTick(state: ProactiveState, now: Date): ProactiveState {
  const today = dayKey(now);
  const ticksToday = state.day === today ? state.ticksToday : 0;
  return { ...state, lastTickAt: now.toISOString(), ticksToday: ticksToday + 1, day: today };
}

/** Mark user activity (resets the idle clock). Pure. */
export function recordActivity(state: ProactiveState, now: Date): ProactiveState {
  return { ...state, lastUserActivityAt: now.toISOString() };
}
