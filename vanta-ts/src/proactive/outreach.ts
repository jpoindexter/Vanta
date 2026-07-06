import { z } from "zod";

// PROACTIVE-CHANNEL-OUTREACH — Vanta messages you FIRST. KAIROS decides when to
// advance queued work; this module decides whether the *user* gets an unprompted
// ping about it on a messaging channel (Telegram/WhatsApp/etc.), under its own
// throttle: strictly opt-in (VANTA_OUTREACH=1 + a target), min-interval + daily
// cap, the budget hard-stop, and a silence switch. Pure decisions + state
// transitions only; delivery lives in outreach-send.ts.

export const OutreachConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Delivery target as `platform:chatId`, e.g. `telegram:123456`. */
  to: z.string().default(""),
  /** At least this many minutes between unprompted messages. */
  minIntervalMin: z.number().min(0).default(30),
  /** Hard cap on unprompted messages per calendar day. */
  maxPerDay: z.number().int().min(0).default(5),
  /** Budget scope whose hard-stop also gates outreach (economic throttle). */
  budgetScope: z.string().min(1).default("session"),
});
export type OutreachConfig = z.infer<typeof OutreachConfigSchema>;

export const OutreachStateSchema = z.object({
  lastSentAt: z.string().nullable().default(null),
  sentToday: z.number().int().min(0).default(0),
  /** Calendar day (YYYY-MM-DD) the counter belongs to; rolls over at a new day. */
  day: z.string().nullable().default(null),
  /** ISO timestamp until which outreach is silenced (null = not silenced). */
  silencedUntil: z.string().nullable().default(null),
});
export type OutreachState = z.infer<typeof OutreachStateSchema>;

export type OutreachDecision = { send: boolean; reason: string };

export function newOutreachState(): OutreachState {
  return OutreachStateSchema.parse({});
}

/** Read outreach config from env (VANTA_OUTREACH_*). Defaults = disabled. */
export function resolveOutreachConfig(env: NodeJS.ProcessEnv): OutreachConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : d;
  };
  return OutreachConfigSchema.parse({
    enabled: env.VANTA_OUTREACH === "1",
    to: env.VANTA_OUTREACH_TO ?? "",
    minIntervalMin: num(env.VANTA_OUTREACH_INTERVAL_MIN, 30),
    maxPerDay: Math.trunc(num(env.VANTA_OUTREACH_MAX_PER_DAY, 5)),
    budgetScope: env.VANTA_OUTREACH_BUDGET_SCOPE || "session",
  });
}

export type OutreachTarget = { platform: string; chatId: string };

/** Parse `platform:chatId` (e.g. `telegram:123456`). Errors as values. */
export function parseOutreachTarget(to: string): OutreachTarget | { error: string } {
  const colon = to.indexOf(":");
  const platform = colon > 0 ? to.slice(0, colon) : "";
  const chatId = colon > 0 ? to.slice(colon + 1) : "";
  if (!platform || !chatId) {
    return { error: `VANTA_OUTREACH_TO must be "platform:chatId" (e.g. telegram:123456), got "${to}"` };
  }
  return { platform, chatId };
}

function minutesBetween(fromIso: string | null, now: Date): number {
  if (!fromIso) return Infinity; // never sent ⇒ no cadence hold
  return (now.getTime() - new Date(fromIso).getTime()) / 60_000;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Decide whether an unprompted message may go out now. Pure — the budget
 * verdict comes from the live store via the orchestrator (outreach-send.ts).
 */
export function decideOutreach(opts: {
  config: OutreachConfig;
  state: OutreachState;
  now: Date;
  budgetExceeded: boolean;
}): OutreachDecision {
  const { config: c, state: s, now } = opts;
  if (!c.enabled) return { send: false, reason: "outreach disabled (set VANTA_OUTREACH=1)" };
  if (!c.to) return { send: false, reason: "no target (set VANTA_OUTREACH_TO=platform:chatId)" };
  if (s.silencedUntil && now < new Date(s.silencedUntil)) {
    return { send: false, reason: `silenced until ${s.silencedUntil}` };
  }
  if (opts.budgetExceeded) return { send: false, reason: `budget exceeded (${c.budgetScope})` };
  const sinceSent = minutesBetween(s.lastSentAt, now);
  if (sinceSent < c.minIntervalMin) {
    return { send: false, reason: `cadence (${sinceSent.toFixed(0)}m < ${c.minIntervalMin}m)` };
  }
  const sentToday = s.day === dayKey(now) ? s.sentToday : 0;
  if (sentToday >= c.maxPerDay) return { send: false, reason: `daily cap (${sentToday}/${c.maxPerDay})` };
  return { send: true, reason: "ok" };
}

/** Record a sent outreach message, rolling the daily counter on a new day. Pure. */
export function recordOutreach(state: OutreachState, now: Date): OutreachState {
  const today = dayKey(now);
  const sentToday = state.day === today ? state.sentToday : 0;
  return { ...state, lastSentAt: now.toISOString(), sentToday: sentToday + 1, day: today };
}

/** Silence outreach until `until` (null clears the silence). Pure. */
export function silenceOutreach(state: OutreachState, until: Date | null): OutreachState {
  return { ...state, silencedUntil: until ? until.toISOString() : null };
}

/** The unprompted finished-work ping sent after a proactive tick. Pure. */
export function outreachTickText(ran: number): string {
  return `Vanta (proactive): advanced ${ran} queued loop wake${ran === 1 ? "" : "s"} while you were away. Reply here or run \`vanta proactive status\` for details; \`vanta proactive silence <minutes>\` to pause these pings.`;
}
