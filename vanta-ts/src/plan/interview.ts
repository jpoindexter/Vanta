import type { CompletionResult, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";

// VANTA-PLAN-INTERVIEW-PHASE — a short clarifying-questions phase before a plan.
//
// When plan mode is entered for a fresh task, Vanta first asks 0–4 concrete
// clarifying questions derived from the task ("Before I plan this, I need to
// clarify: …"). The operator's answers are folded into the plan prompt before
// the plan is generated. The provider call is INJECTED so the pure prompt
// builders + parsers are unit-testable without an LLM, and the whole phase
// fails OPEN (no questions) on any provider error — it must never block.

/** The slice of an LLMProvider the interview needs — injected for testing. */
export type InterviewProvider = {
  complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: { temperature?: number; maxTokens?: number },
  ): Promise<CompletionResult>;
};

export type InterviewDeps = { provider: InterviewProvider };

export type InterviewConfig = { enabled: boolean };

export type InterviewQa = { question: string; answer: string };

/** Hard ceiling — never surface more than this many questions. */
const MAX_QUESTIONS = 4;

const QUESTION_HEADER = "Before I plan this, I need to clarify:";

/**
 * Build the prompt that asks the model for clarifying questions. Pure so the
 * exact wording is unit-tested. The task is embedded verbatim; the model is
 * told to return [] when the task is already specific enough to plan.
 */
export function buildInterviewPrompt(task: string): string {
  return [
    "You are about to write an implementation plan for the task below.",
    "Before planning, list ONLY the genuinely blocking questions whose answers",
    "would change the plan — scope, target, data shape, or an unstated choice.",
    `Ask at most ${MAX_QUESTIONS}. If the task is already specific enough to`,
    "plan without guessing, return an empty list.",
    "",
    "Return ONLY a JSON array of question strings, e.g. [\"Which DB?\"].",
    "No prose, no numbering, no markdown fences.",
    "",
    "TASK:",
    task.trim(),
  ].join("\n");
}

/** Trim, drop empties, cap to MAX_QUESTIONS — shared by every parse path. */
function normalizeQuestions(raw: unknown[]): string[] {
  return raw
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter((q) => q.length > 0)
    .slice(0, MAX_QUESTIONS);
}

/**
 * Parse the model's reply into questions. Accepts a bare JSON array, or a JSON
 * array embedded in surrounding text (some models wrap it). Anything that
 * doesn't yield a string array → [] (fail open: no questions, not a crash).
 */
export function parseQuestions(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    return Array.isArray(parsed) ? normalizeQuestions(parsed) : [];
  } catch {
    return [];
  }
}

/**
 * Ask the injected provider for 0–4 clarifying questions for `task`.
 * Returns [] when the task is already specific OR on any provider error
 * (fail open — the interview phase must never block planning).
 */
export async function generateClarifyingQuestions(
  task: string,
  deps: InterviewDeps,
): Promise<string[]> {
  if (!task.trim()) return [];
  try {
    const result = await deps.provider.complete(
      [{ role: "user", content: buildInterviewPrompt(task) }],
      [],
      { temperature: 0 },
    );
    return parseQuestions(result.text ?? "");
  } catch {
    return [];
  }
}

/**
 * Render the clarifying-questions block shown to the operator. Pure. Returns
 * "" when there are no questions (callers skip the phase entirely).
 */
export function formatInterview(questions: string[]): string {
  if (questions.length === 0) return "";
  const lines = questions.map((q, i) => `${i + 1}. ${q}`);
  return [QUESTION_HEADER, ...lines].join("\n");
}

/**
 * Fold the operator's answers into the plan prompt. Pure. Produces the
 * augmented instruction string that the plan generation step consumes:
 * the original task plus a "Clarifications" section pairing each question
 * with its answer. Unanswered questions are surfaced as "(no answer given)"
 * so the planner knows the gap rather than silently assuming.
 */
export function foldAnswersIntoPlan(task: string, qa: InterviewQa[]): string {
  const base = task.trim();
  if (qa.length === 0) return base;
  const pairs = qa.map((item, i) => {
    const answer = item.answer.trim() || "(no answer given)";
    return `${i + 1}. Q: ${item.question.trim()}\n   A: ${answer}`;
  });
  return [
    base,
    "",
    "Clarifications (operator answers — fold these into the plan):",
    ...pairs,
  ].join("\n");
}

/**
 * Resolve whether the interview phase runs. Default ON (it only fires inside
 * plan mode); VANTA_PLAN_INTERVIEW=0 (or false/off/no) disables it.
 */
export function resolveInterviewConfig(env: NodeJS.ProcessEnv): InterviewConfig {
  const raw = (env.VANTA_PLAN_INTERVIEW ?? "").trim().toLowerCase();
  const disabled = raw === "0" || raw === "false" || raw === "off" || raw === "no";
  return { enabled: !disabled };
}
