import type { Message } from "../types.js";

export const DEFAULT_SCOPE_DELTA_THRESHOLD = 3;

const FILE_TOOLS = new Set(["read_file", "write_file"]);

export type ScopeDeltaState = { totalAnnotations: number };

/**
 * Counts distinct "topics" touched in the last assistant turn:
 * unique file paths accessed (read_file / write_file) plus unique non-file
 * tool types used. Stops at the most recent user message.
 */
export function countTopicsInLastTurn(messages: Message[]): number {
  const filePaths = new Set<string>();
  const otherTools = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") break;
    if (m.role !== "assistant" || !m.toolCalls) continue;
    for (const tc of m.toolCalls) {
      if (FILE_TOOLS.has(tc.name) && typeof tc.arguments.path === "string") {
        filePaths.add(tc.arguments.path);
      } else if (!FILE_TOOLS.has(tc.name)) {
        otherTools.add(tc.name);
      }
    }
  }
  return filePaths.size + otherTools.size;
}

/** True when the topic count strictly exceeds the threshold (matching "if > N" semantics). */
export function shouldAnnotateScopeDelta(count: number, threshold = DEFAULT_SCOPE_DELTA_THRESHOLD): boolean {
  return threshold > 0 && count > threshold;
}

export function nextScopeDeltaState(
  prev: ScopeDeltaState,
  count: number,
  threshold = DEFAULT_SCOPE_DELTA_THRESHOLD,
): ScopeDeltaState {
  if (!shouldAnnotateScopeDelta(count, threshold)) return prev;
  return { totalAnnotations: prev.totalAnnotations + 1 };
}

/** Dim, non-alarming annotation — shows count and session accumulation. */
export function buildScopeDeltaText(count: number, totalAnnotations: number): string {
  const sessionNote = totalAnnotations > 1 ? ` (${totalAnnotations}× this session)` : "";
  return `· ${count} topics this turn${sessionNote}`;
}
