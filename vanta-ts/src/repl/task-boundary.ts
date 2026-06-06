import type { Goal } from "../types.js";

// Stopwords excluded from the overlap comparison so "I", "the", "a", etc. don't
// inflate the similarity score between unrelated topics.
const STOPWORDS = new Set([
  "i", "a", "an", "the", "to", "of", "in", "on", "for", "with", "and", "or",
  "it", "is", "be", "my", "me", "we", "do", "not", "this", "that", "you", "can",
  "how", "what", "which", "from", "by", "at", "up", "into", "out", "so",
]);

/** Extract non-trivial words from text for overlap comparison. Pure. */
export function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

/**
 * Jaccard similarity between the keyword sets of a message and an active goal.
 * Returns 0.0–1.0; higher = more overlap. Returns 1.0 when both sets are empty.
 */
export function topicOverlap(message: string, goalText: string): number {
  const msgKeys = extractKeywords(message);
  const goalKeys = extractKeywords(goalText);
  if (msgKeys.size === 0 && goalKeys.size === 0) return 1;
  if (msgKeys.size === 0 || goalKeys.size === 0) return 0;
  let shared = 0;
  for (const w of msgKeys) {
    if (goalKeys.has(w)) shared++;
  }
  const union = msgKeys.size + goalKeys.size - shared;
  return shared / union;
}

/**
 * True when the message looks like a topic shift: long enough to judge, low
 * overlap with the active goal, and not a slash command.
 */
export function isTopicShift(
  message: string,
  activeGoal: Goal | null,
  overlapThreshold: number,
): boolean {
  if (!activeGoal) return false;
  if (message.startsWith("/")) return false;
  if (message.trim().split(/\s+/).length < 4) return false; // too short to judge
  return topicOverlap(message, activeGoal.text) < overlapThreshold;
}

/** Suggestion note when a topic shift is detected. */
export function buildTopicShiftNote(): string {
  return "↩ Topic shift detected — your active goal may differ from this new request. Use /boundary to mark the transition and archive the current task.";
}

/** The boundary marker injected into the conversation transcript. */
export const BOUNDARY_MARKER = "<!-- task-boundary -->";

/** Confirmation text shown to the user when /boundary is executed. */
export function buildBoundaryConfirmation(prevGoalText: string | null): string {
  const goalNote = prevGoalText
    ? `\nPrevious task: "${prevGoalText.slice(0, 80)}${prevGoalText.length > 80 ? "…" : ""}"`
    : "";
  return `  ✓ Task boundary marked.${goalNote}\n  Previous task state preserved in conversation history. Starting fresh cognitive set.`;
}
