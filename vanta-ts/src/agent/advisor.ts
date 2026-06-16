import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import { resolveProvider } from "../providers/index.js";

// Read-only diagnostic advisor: fires after consecutive tool failures, consults a
// (optionally stronger) model with NO tools so it literally cannot write code or run shell.
// Env: VANTA_ADVISOR_MODEL — model override (same VANTA_PROVIDER, different model).
// If unset, advisor is disabled.

const MAX_CONTEXT_MESSAGES = 12;

const SYSTEM = [
  "You are a read-only diagnostic advisor. The agent loop has hit repeated tool failures.",
  "Analyze the recent conversation and respond with exactly three sections:",
  "1. Root cause — one concise paragraph identifying the underlying issue.",
  "2. Next steps — 3-5 numbered concrete actions, read-only first (check files, inspect state, verify paths).",
  "3. Trade-offs — a brief note on the two most likely approaches if the cause is ambiguous.",
  "Do NOT suggest writing code, editing files, or running shell commands. Analysis only.",
].join("\n");

export function resolveAdvisorProvider(env: NodeJS.ProcessEnv): LLMProvider | null {
  const model = env.VANTA_ADVISOR_MODEL?.trim();
  if (!model) return null;
  try {
    return resolveProvider({ ...env, VANTA_MODEL: model });
  } catch {
    return null;
  }
}

export async function runAdvisor(
  messages: Message[],
  provider: LLMProvider,
  failures: number,
): Promise<string> {
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES);
  const probe: Message = {
    role: "user",
    content: `The agent has hit ${failures} consecutive tool failures. Provide the root-cause analysis and recovery steps as instructed.`,
  };
  try {
    const result = await provider.complete(
      [{ role: "user", content: SYSTEM }, ...recent, probe],
      [],
    );
    return result.text.trim() || "(advisor returned no analysis)";
  } catch (err) {
    return `(advisor unavailable: ${err instanceof Error ? err.message : String(err)})`;
  }
}
