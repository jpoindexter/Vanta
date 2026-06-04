import { PLAN_MARKER } from "./plan-mode.js";
import type { Message } from "../types.js";

export const DEFAULT_COMPLEXITY_THRESHOLD = 5;

// Heuristic signals — each adds to the score when matched in the user message.
// No LLM call; this runs synchronously before every turn.
const SIGNALS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\b(refactor|rewrite|redesign|overhaul|migrate|migration)\b/i, score: 3 },
  { pattern: /\b(schema|database|migration|alter table)\b/i, score: 2 },
  { pattern: /\b(across|all files|every file|multiple files)\b/i, score: 2 },
  { pattern: /\bnot sure\b|\bsomehow\b|\bfigure out\b|\bany way to\b/i, score: 2 },
  { pattern: /\b(architecture|infrastructure|system design)\b/i, score: 2 },
  { pattern: /\band\b.+?\band\b/i, score: 1 }, // compound task (two or more "and"s)
  { pattern: /\b(step|phase|part)\s+[0-9]/i, score: 1 },
];

/** Heuristic complexity score 0–10 for a user message. Pure, synchronous. */
export function scoreComplexity(message: string): number {
  const raw = SIGNALS.reduce((sum, s) => sum + (s.pattern.test(message) ? s.score : 0), 0);
  return Math.min(raw, 10);
}

/** True if plan mode is already injected into the system message. */
export function isPlanModeActive(messages: Message[]): boolean {
  const sys = messages[0];
  return sys?.role === "system" && sys.content.includes(PLAN_MARKER);
}

/**
 * True when complexity is above the threshold and plan mode is not already on.
 * Set ARGO_COMPLEXITY_GATE_THRESHOLD to a number to override; 0 disables.
 */
export function shouldSuggestPlanMode(
  score: number,
  messages: Message[],
  env: NodeJS.ProcessEnv,
): boolean {
  const raw = parseInt(env.ARGO_COMPLEXITY_GATE_THRESHOLD ?? "", 10);
  const threshold = isNaN(raw) || raw < 0 ? DEFAULT_COMPLEXITY_THRESHOLD : raw;
  return threshold > 0 && score >= threshold && !isPlanModeActive(messages);
}

/** One-line suggestion note. */
export function buildComplexityNote(score: number): string {
  return `⚠ Complex request (score ${score}/10) — consider /planmode for step-by-step planning before execution.`;
}
