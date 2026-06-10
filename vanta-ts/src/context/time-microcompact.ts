// Time-based microcompact: after a long idle gap, clear old
// tool results before the next API call so the resumed prompt is lean. Pure and
// transient: returns a NEW array, never mutates the live transcript, never throws.

import type { Message } from "../types.js";

/** Idle gap (ms) after which stale tool results are cleared. Default: 60 minutes. */
export const DEFAULT_IDLE_MS = 60 * 60 * 1000;
/** How many of the most-recent tool results to keep verbatim. */
export const DEFAULT_KEEP_RECENT = 4;

/** Placed in dropped tool results so the assistant↔tool pairing the API requires stays valid. */
const CLEARED_STUB = "[old tool result cleared after idle]";

export type IdleConfig = { thresholdMs: number; keepRecent: number };

export type ClearOpts = { thresholdMs?: number; keepRecent?: number };

/**
 * Replace stale `role:"tool"` message contents with a short stub when the idle
 * gap exceeds the threshold, keeping the last `keepRecent` tool results verbatim.
 * Dropped tool messages stay IN PLACE (content swapped only) so every assistant
 * tool_call keeps its matching tool_result at the same position.
 *
 * Under threshold → returns the same array reference (common path stays a no-op).
 */
export function clearStaleToolResults(
  messages: Message[],
  idleMs: number,
  opts?: ClearOpts,
): Message[] {
  const thresholdMs = opts?.thresholdMs ?? DEFAULT_IDLE_MS;
  const keepRecent = Math.max(0, opts?.keepRecent ?? DEFAULT_KEEP_RECENT);
  if (!(idleMs >= thresholdMs)) return messages; // also handles NaN/negative idle

  const toolIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "tool") toolIdxs.push(i);
  }
  // slice(length - keepRecent) — NOT slice(-keepRecent): the negative form keeps
  // everything when keepRecent is 0 (slice(-0) === slice(0)).
  const keepFrom = Math.max(0, toolIdxs.length - keepRecent);
  const keptIdxs = new Set(toolIdxs.slice(keepFrom));

  return messages.map((m, i) =>
    m.role === "tool" && !keptIdxs.has(i) ? { ...m, content: CLEARED_STUB } : m,
  );
}

/** Read idle-compact overrides from the environment (positive integers only). */
export function resolveIdleConfig(env: NodeJS.ProcessEnv): IdleConfig {
  return {
    thresholdMs: positiveIntOr(env.VANTA_MICROCOMPACT_IDLE_MS, DEFAULT_IDLE_MS),
    keepRecent: positiveIntOr(env.VANTA_MICROCOMPACT_KEEP, DEFAULT_KEEP_RECENT),
  };
}

function positiveIntOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
