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
/** Tool-call names in the last assistant turn (back to the prior user message). */
function lastTurnToolNames(messages: Message[]): string[] {
  const names: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") break;
    if (m.role === "assistant" && m.toolCalls) names.push(...m.toolCalls.map((tc) => tc.name));
  }
  return names;
}

export function detectWmMode(messages: Message[]): WmMode {
  const names = lastTurnToolNames(messages);
  if (names.some((n) => MEMORY_WRITE_TOOLS.has(n))) return "manipulation";
  if (names.some((n) => MEMORY_READ_TOOLS.has(n))) return "maintenance";
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
