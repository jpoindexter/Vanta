import type { SlashHandler } from "./types.js";

/**
 * VANTA-STOP-CMD — graceful soft-stop.
 *
 * Esc aborts the turn IMMEDIATELY (mid-tool). `/stop` is the SOFT counterpart:
 * it sets a one-shot flag the agent loop reads at the post-tool-call boundary,
 * so the in-flight tool call finishes, then the turn exits cleanly with a brief
 * summary of what completed — no mid-tool abort, no partial tool result.
 *
 * The signal is a tiny mutable ref shared by the handler (writer) and the host
 * (which injects `deps.shouldSoftStop = () => signal.requested`). One-shot:
 * `consume()` reads-and-clears so the next turn starts clean.
 */
export type SoftStopSignal = { requested: boolean };

/** Construct a fresh soft-stop signal — one per interactive session. */
export function createSoftStopSignal(): SoftStopSignal {
  return { requested: false };
}

/** The injected loop predicate: true iff a soft-stop is pending. */
export function softStopPredicate(signal: SoftStopSignal): () => boolean {
  return () => signal.requested;
}

/** Read-and-clear the pending soft-stop (one-shot). Returns whether it was set. */
export function consumeSoftStop(signal: SoftStopSignal): boolean {
  const was = signal.requested;
  signal.requested = false;
  return was;
}

/**
 * Pure summary of the work completed before a soft-stop took effect. Names the
 * tools run this turn (deduped, in first-seen order) and the count, or notes
 * that nothing ran yet. Used by the loop to build the turn's final text.
 */
export function buildStopSummary(toolNames: ReadonlyArray<string>): string {
  if (!toolNames.length) return "Soft-stopped before any tool ran.";
  const seen: string[] = [];
  for (const name of toolNames) if (!seen.includes(name)) seen.push(name);
  const n = toolNames.length;
  const plural = n === 1 ? "call" : "calls";
  return `Soft-stopped after the in-flight tool finished. Completed ${n} tool ${plural}: ${seen.join(", ")}.`;
}

/**
 * `/stop` — request a graceful soft-stop. Sets the shared signal; the agent loop
 * finishes the current tool call, then ends the turn with a completed-work
 * summary. No effect if no turn is running (the flag clears on the next turn).
 */
export function buildStopHandler(signal: SoftStopSignal): SlashHandler {
  return () => {
    signal.requested = true;
    return { output: "  ◼ soft-stop requested — finishing the current tool call, then ending the turn." };
  };
}

/**
 * Process-wide soft-stop signal shared by the registered `/stop` handler (writer)
 * and the host, which injects `deps.shouldSoftStop = softStopPredicate(SOFT_STOP)`
 * into the conversation. A bare module singleton (not session-scoped) because the
 * REPL runs one conversation at a time; the loop one-shot-clears it per turn via
 * `consumeSoftStop`. The host reads-and-clears at turn start so a stale request
 * never leaks into the next turn.
 */
export const SOFT_STOP: SoftStopSignal = createSoftStopSignal();

/** The registered `/stop` slash handler, bound to the shared module signal. */
export const stop: SlashHandler = buildStopHandler(SOFT_STOP);
