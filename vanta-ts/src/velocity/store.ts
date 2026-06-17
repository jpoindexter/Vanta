import { resolveMemoryStore } from "../store/memory-store.js";

export type VelocityEvent = {
  type: "capture" | "ship";
  itemId: string;
  at: string;
};

const VELOCITY_PATH = "velocity.json";

/** Append a single event to ~/.vanta/velocity.json. Creates the file if absent. */
export async function appendVelocityEvent(
  env: NodeJS.ProcessEnv,
  event: VelocityEvent,
): Promise<void> {
  const store = resolveMemoryStore(env);
  let events: VelocityEvent[] = [];
  try {
    const raw = await store.read(VELOCITY_PATH);
    if (raw !== null) events = JSON.parse(raw) as VelocityEvent[];
  } catch {
    // file absent or malformed — start fresh
  }
  events.push(event);
  await store.write(VELOCITY_PATH, JSON.stringify(events, null, 2) + "\n");
}

/** Read all recorded events. Returns [] if the file doesn't exist yet. */
export async function readVelocityEvents(
  env: NodeJS.ProcessEnv,
): Promise<VelocityEvent[]> {
  try {
    const raw = await resolveMemoryStore(env).read(VELOCITY_PATH);
    if (raw === null) return [];
    return JSON.parse(raw) as VelocityEvent[];
  } catch {
    return [];
  }
}

export type VelocityStats = {
  captures: number;
  ships: number;
  /** Capture:ship ratio — null when no ships (division by zero). */
  ratio: number | null;
  /** True when ratio > 5 or there are captures but zero ships in window. */
  warn: boolean;
};

const WARN_THRESHOLD = 5;

/**
 * Compute 7-day (or custom window) capture/ship counts from a list of events.
 * Pure — no I/O, no Date.now() calls — so it's trivially testable.
 */
export function velocityStats(
  events: VelocityEvent[],
  windowMs: number,
  now: Date,
): VelocityStats {
  const cutoff = now.getTime() - windowMs;
  const recent = events.filter((e) => new Date(e.at).getTime() >= cutoff);
  const captures = recent.filter((e) => e.type === "capture").length;
  const ships = recent.filter((e) => e.type === "ship").length;
  const ratio = ships === 0 ? null : captures / ships;
  const warn = ships === 0 ? captures > 0 : ratio! > WARN_THRESHOLD;
  return { captures, ships, ratio, warn };
}
