import type { LLMProvider } from "../providers/interface.js";
import type { Goal, Message, ToolCall } from "../types.js";

export type CompletionVerifierResult = {
  verdict: "pass" | "fail";
  evidence: string;
};

export type CompletionVerifierTurn = {
  messages: Message[];
  taskDescription?: string;
};

export type CompletionVerifierCtx = {
  provider: LLMProvider;
  goals?: Goal[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  logEvent?: (event: string) => Promise<void>;
};

const COMPLETION_RE = /\b(done|complete|completed|finished|shipped)\b/i;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOOL_OUTPUTS = 6;

export function shouldVerifyCompletion(
  turn: CompletionVerifierTurn,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VANTA_VERIFY !== "1") return false;
  return assertsCompletion(turn.messages);
}

export async function runCompletionVerifier(
  turn: CompletionVerifierTurn,
  ctx: CompletionVerifierCtx,
): Promise<CompletionVerifierResult> {
  const env = ctx.env ?? process.env;
  if (!shouldVerifyCompletion(turn, env)) {
    return { verdict: "pass", evidence: "completion verifier disabled" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const result = await ctx.provider.complete(buildVerifierMessages(turn, ctx), [], {
      temperature: 0,
      maxTokens: 80,
      signal: controller.signal,
    });
    return parseVerifierText(result.text);
  } catch {
    const timedOut = controller.signal.aborted;
    await ctx.logEvent?.(timedOut ? "completion_verifier: timeout/discard" : "completion_verifier: unavailable/discard").catch(() => {});
    return {
      verdict: "pass",
      evidence: timedOut ? "completion verifier timed out" : "completion verifier unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}

function assertsCompletion(messages: Message[]): boolean {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && COMPLETION_RE.test(lastAssistant.content)) return true;
  return messages.some((m) => {
    if (m.role === "assistant") return (m.toolCalls ?? []).some(callCompletedTask);
    if (m.role === "tool") return /task[_-]?update/i.test(m.name) && COMPLETION_RE.test(m.content);
    return false;
  });
}

function callCompletedTask(call: ToolCall): boolean {
  const haystack = `${call.name} ${JSON.stringify(call.arguments)}`;
  return /task[_-]?update|update_plan/i.test(haystack) && /completed/i.test(haystack);
}

function buildVerifierMessages(turn: CompletionVerifierTurn, ctx: CompletionVerifierCtx): Message[] {
  const task = originalTask(turn, ctx.goals ?? []);
  const evidence = recentToolEvidence(turn.messages);
  const final = lastAssistantText(turn.messages);
  return [
    {
      role: "system",
      content: "You are a completion verifier. Answer exactly YES or NO, then one short sentence of evidence.",
    },
    {
      role: "user",
      content: `Original task:\n${task}\n\nRecent tool outputs:\n${evidence}\n\nAssistant completion claim:\n${final}`,
    },
  ];
}

function originalTask(turn: CompletionVerifierTurn, goals: Goal[]): string {
  if (turn.taskDescription?.trim()) return turn.taskDescription.trim();
  const active = goals.find((g) => g.status === "active");
  if (active) return active.text;
  const lastUser = [...turn.messages].reverse().find((m) => m.role === "user");
  return lastUser?.content.trim() || "(unknown)";
}

function recentToolEvidence(messages: Message[]): string {
  const tools = messages.filter((m) => m.role === "tool").slice(-MAX_TOOL_OUTPUTS);
  if (!tools.length) return "(no recent tool output)";
  return tools.map((m) => `${m.name}: ${m.content.slice(0, 500)}`).join("\n");
}

function lastAssistantText(messages: Message[]): string {
  const msg = [...messages].reverse().find((m) => m.role === "assistant");
  return msg?.content.trim() || "(no assistant text)";
}

function parseVerifierText(text: string): CompletionVerifierResult {
  const trimmed = text.trim();
  const pass = /^yes\b/i.test(trimmed);
  const fail = /^no\b/i.test(trimmed);
  const verdict = pass ? "pass" : "fail";
  if (!pass && !fail) return { verdict, evidence: trimmed || "verifier gave no evidence" };
  const evidence = trimmed.replace(/^(yes|no)\b\s*[-:,.]?\s*/i, "").trim();
  return { verdict, evidence: evidence || "verifier gave no evidence" };
}
