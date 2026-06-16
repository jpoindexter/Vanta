import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import { extractLastTurnCalls } from "./trace.js";

// Independent critic agent (PAPER-OBSERVABILITY). Given the active goal + the last
// turn (user message, assistant reply, tool trace), a separate LLM call scores the
// turn quality independently — generator/evaluator separation prevents the model
// from praising its own work. Opt-in: VANTA_CRITIC=1. Best-effort.

const MIN_CALLS_TO_SCORE = 3; // only score substantive turns

const CRITIC_SYS = `You are an independent evaluator assessing an AI agent's turn.
Score 0–10 (10=excellent: verified, goal-focused, no hallucination; 0=harmful/fabricated).
Focus on: (1) goal alignment, (2) verified vs claimed, (3) tool-call efficiency, (4) honesty.
Reply ONLY as minified JSON: {"score":N,"issues":["…"],"summary":"1 sentence"}
If score ≥7 set issues=[]. Be specific and brief.`;

export type CriticScore = {
  score: number;
  issues: string[];
  summary: string;
};

function buildTurnSummary(
  goal: string,
  userMsg: string,
  assistantText: string,
  calls: Array<{ name: string; result: string }>,
): string {
  const toolLines = calls
    .slice(0, 6)
    .map((c) => `  ${c.name}: ${c.result.slice(0, 120)}`)
    .join("\n");
  return [
    `Goal: ${goal}`,
    `User: ${userMsg.slice(0, 250)}`,
    `Agent: ${assistantText.slice(0, 350)}`,
    calls.length ? `Tools (${calls.length}):\n${toolLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Score a completed turn with an independent critic LLM call.
 * Returns null on any failure — caller treats null as "no score this turn".
 * Opt-in: VANTA_CRITIC=1. Only fires when the turn used ≥MIN_CALLS_TO_SCORE tools.
 */
/** Last user + assistant message of the turn, or null if the pair is incomplete. */
function lastTurnIO(messages: Message[]): { user: string; assistant: string } | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastUser || !lastAssistant || lastAssistant.role !== "assistant") return null;
  return { user: lastUser.role === "user" ? lastUser.content : "", assistant: lastAssistant.content };
}

/** Parse the critic LLM's JSON reply into a CriticScore; null on malformed output. */
function parseCriticScore(text: string): CriticScore | null {
  try {
    const raw: unknown = JSON.parse(text.trim());
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    return {
      score: Number(r.score ?? 0),
      issues: Array.isArray(r.issues) ? r.issues.map(String) : [],
      summary: String(r.summary ?? ""),
    };
  } catch { return null; }
}

export async function scoreTurn(opts: {
  provider: LLMProvider;
  goal: string;
  messages: Message[];
  env?: NodeJS.ProcessEnv;
}): Promise<CriticScore | null> {
  const env = opts.env ?? process.env;
  if (env.VANTA_CRITIC !== "1") return null;
  try {
    const calls = extractLastTurnCalls(opts.messages);
    if (calls.length < MIN_CALLS_TO_SCORE) return null;
    const io = lastTurnIO(opts.messages);
    if (!io) return null;
    const turnSummary = buildTurnSummary(opts.goal, io.user, io.assistant, calls);
    const { text } = await opts.provider.complete(
      [{ role: "system", content: CRITIC_SYS }, { role: "user", content: turnSummary }],
      [],
    );
    return parseCriticScore(text);
  } catch { return null; }
}

export function formatCriticNote(score: CriticScore): string {
  const bar = "█".repeat(Math.round(score.score / 2)) + "░".repeat(5 - Math.round(score.score / 2));
  const issueLines = score.issues.length ? `\n  Issues: ${score.issues.join("; ")}` : "";
  return `  critic [${bar}] ${score.score}/10 — ${score.summary}${issueLines}`;
}
