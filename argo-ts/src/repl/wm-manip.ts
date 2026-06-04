import type { Message } from "../types.js";

export const DEFAULT_MANIP_THRESHOLD = 3;

/** Working memory mode for the current turn. */
export type WmMode = "maintenance" | "manipulation" | "none";

export type WmManipState = { manipTurns: number };

const MEMORY_WRITE_TOOLS = new Set(["brain", "write_skill"]);
const MEMORY_READ_TOOLS = new Set(["brain", "recall", "read_file"]);

/**
 * Classify the last assistant turn's working memory mode:
 * - "manipulation": turn involved writing to memory/brain (active transformation)
 * - "maintenance": turn involved reading memory but no writes (holding without transforming)
 * - "none": no memory tool calls
 */
export function detectWmMode(messages: Message[]): WmMode {
  let hasWrite = false;
  let hasRead = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") break;
    if (m.role !== "assistant" || !m.toolCalls) continue;
    for (const tc of m.toolCalls) {
      if (MEMORY_WRITE_TOOLS.has(tc.name)) hasWrite = true;
      if (MEMORY_READ_TOOLS.has(tc.name)) hasRead = true;
    }
  }
  if (hasWrite) return "manipulation";
  if (hasRead) return "maintenance";
  return "none";
}

export function nextWmManipState(prev: WmManipState, mode: WmMode): WmManipState {
  if (mode === "manipulation") return { manipTurns: prev.manipTurns + 1 };
  return { manipTurns: 0 };
}

export function shouldAlertWmManip(state: WmManipState, threshold = DEFAULT_MANIP_THRESHOLD): boolean {
  return threshold > 0 && state.manipTurns >= threshold;
}

export function buildWmManipText(manipTurns: number): string {
  return (
    `⚙ ${manipTurns} consecutive turns in working-memory manipulation mode.\n` +
    `Consider: has the transformation produced a concrete output (decision, code, plan)?`
  );
}
