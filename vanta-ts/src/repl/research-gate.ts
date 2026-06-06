import type { Message } from "../types.js";
import type { Goal } from "../types.js";

export const DEFAULT_RESEARCH_GATE_TURNS = 8;

// Tools that produce durable output — writing files, running shell commands (which
// may commit code, run tests, etc.), and roadmap moves. Seeing any of these in a
// turn resets the research turn counter.
const OUTPUT_TOOL_NAMES = new Set(["write_file", "roadmap_move", "shell_cmd"]);

/** True when the turn included at least one output-producing tool call. */
export function isOutputTurn(toolNames: string[]): boolean {
  return toolNames.some((n) => OUTPUT_TOOL_NAMES.has(n));
}

export type ResearchGateState = { consecutiveTurns: number };

/** Pure state transition. Resets to 0 on an output turn; increments otherwise. */
export function nextGateState(
  prev: ResearchGateState,
  toolNames: string[],
): ResearchGateState {
  return isOutputTurn(toolNames)
    ? { consecutiveTurns: 0 }
    : { consecutiveTurns: prev.consecutiveTurns + 1 };
}

/**
 * Fire when consecutiveTurns reaches the threshold, and again at each subsequent
 * multiple — so a 10-turn spiral fires at 8 and again at 16.
 */
export function shouldFireGate(state: ResearchGateState, threshold: number): boolean {
  return (
    threshold > 0 &&
    state.consecutiveTurns > 0 &&
    state.consecutiveTurns % threshold === 0
  );
}

/** Extract the tool names called in the most recent assistant turn. */
export function extractLastTurnToolNames(messages: Message[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "assistant") {
      return m.toolCalls?.map((tc) => tc.name) ?? [];
    }
  }
  return [];
}

/** Build the pattern-interrupt note text. */
export function buildGateText(consecutiveTurns: number, activeGoal: Goal | null): string {
  const goalLine = activeGoal ? `\nOriginal goal: "${activeGoal.text}"` : "";
  return (
    `💡 ${consecutiveTurns} research turns since last concrete output.${goalLine}\n` +
    `Want to pick one finding to build now? (or keep exploring — just checking in)`
  );
}
