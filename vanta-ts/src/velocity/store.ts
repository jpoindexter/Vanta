import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export type VelocityEvent = {
  type: "capture" | "ship";
  itemId: string;
  at: string;
};

function velocityPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "velocity.json");
}

/** Append a single event to ~/.vanta/velocity.json. Creates the file if absent. */
export async function appendVelocityEvent(
  env: NodeJS.ProcessEnv,
  event: VelocityEvent,
): Promise<void> {
  const path = velocityPath(env);
  await mkdir(dirname(path), { recursive: true });
  let events: VelocityEvent[] = [];
  try {
    events = JSON.parse(await readFile(path, "utf8")) as VelocityEvent[];
  } catch {
    // file absent or malformed — start fresh
  }
  events.push(event);
  await writeFile(path, JSON.stringify(events, null, 2) + "\n", "utf8");
}

/** Read all recorded events. Returns [] if the file doesn't exist yet. */
export async function readVelocityEvents(
  env: NodeJS.ProcessEnv,
): Promise<VelocityEvent[]> {
  try {
    return JSON.parse(await readFile(velocityPath(env), "utf8")) as VelocityEvent[];
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
