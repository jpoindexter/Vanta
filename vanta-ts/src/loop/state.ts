import type { Escalation, LoopDef, LoopState } from "./types.js";

// Pure helpers over LoopState. The store persists; these only transform. Kept
// out of types.ts so that file stays declarative. Escalations are the durable
// "stop and surface the blocker" primitive: a loop raises one when it hits
// something it cannot resolve, which pauses it until a human clears it.

export function openEscalations(state: LoopState): Escalation[] {
  return state.escalations.filter((e) => e.status === "open");
}

export function hasOpenEscalations(state: LoopState): boolean {
  return state.escalations.some((e) => e.status === "open");
}

/** Append a new open escalation. Id is derived from the count so it is stable
 *  and testable (no clock/random). Caller pauses the loop separately. */
export function raiseEscalation(state: LoopState, reason: string, now: Date): LoopState {
  const esc: Escalation = {
    id: `esc-${state.escalations.length + 1}`,
    raisedAt: now.toISOString(),
    reason,
    status: "open",
    clearedAt: null,
  };
  return { ...state, escalations: [...state.escalations, esc] };
}

/** Mark one escalation cleared (a human action). No-op if the id is unknown or
 *  already cleared; returns whether anything changed so the CLI can report it. */
export function clearEscalation(
  state: LoopState,
  id: string,
  now: Date,
): { state: LoopState; cleared: boolean } {
  let cleared = false;
  const escalations = state.escalations.map((e) => {
    if (e.id !== id || e.status === "cleared") return e;
    cleared = true;
    return { ...e, status: "cleared" as const, clearedAt: now.toISOString() };
  });
  return { state: { ...state, escalations }, cleared };
}

export function markInProgress(state: LoopState, on: boolean, now?: Date): LoopState {
  // Stamp runStartedAt when a run begins (if a clock is given); clear it on a
  // clean exit. The watchdog uses it to measure how long a stuck run has hung.
  const runStartedAt = on ? (now ? now.toISOString() : state.runStartedAt) : null;
  return { ...state, inProgress: on, runStartedAt };
}

const MAX_REMINDER_LESSONS = 5;

/**
 * The text re-injected into every stage prompt so a loop's goal and live
 * constraints survive the turn's own context compaction — the concrete defense
 * against goal drift. Carries the goal, any open blockers, and recent lessons.
 */
export function loopStateReminder(def: LoopDef, state: LoopState): string {
  const lines = [`Loop goal: ${def.goal}`];
  const open = openEscalations(state);
  if (open.length > 0) {
    lines.push(`Open blockers (a human must clear these): ${open.map((e) => e.reason).join("; ")}`);
  }
  const lessons = state.lessons.slice(-MAX_REMINDER_LESSONS);
  if (lessons.length > 0) {
    lines.push(`Lessons so far: ${lessons.join("; ")}`);
  }
  return lines.join("\n");
}
