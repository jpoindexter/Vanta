import type { CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";
import type { AgentDeps } from "./agent-types.js";
import { runCompletionVerifier } from "../verify/completion-verifier.js";

// VANTA-AUTOCONTINUE — fix premature stopping ("agentic laziness"): when the model
// did work this turn then returned text instead of finishing, keep going. Bounded
// (cap + the turn's maxIter), and exempts genuine asks so the clarify flow still waits.

export const CONTINUE_NUDGE =
  "Continue — you did work but the task is not finished. Do the next step NOW (actually perform it, don't just describe it). " +
  "Only stop when the task is fully complete; if you need a decision only the user can make, call clarify or ask_user.";

// Signals the model announced more work but stopped (without an explicit completion claim).
const CONTINUE_SIGNAL_RE =
  /\b(next step|i'?ll now|i will now|then i'?ll|then i will|continuing|proceed(?:ing)? to|remaining (?:step|item)|still (?:need|have) to|step \d|i'?ll continue|moving on to|let me (?:now )?(?:do|run|build|continue|start|write|create|gather|fetch|read|check))\b|^\s*[-*]\s*\[ \]/im;

export function looksUnfinished(text: string): boolean {
  return CONTINUE_SIGNAL_RE.test(text);
}

/** Max auto-continues per turn. `VANTA_AUTOCONTINUE=0` disables; `VANTA_AUTOCONTINUE_MAX` overrides (default 3). */
function autoContinueMax(env: NodeJS.ProcessEnv): number {
  if (env.VANTA_AUTOCONTINUE === "0") return 0;
  const raw = Number(env.VANTA_AUTOCONTINUE_MAX);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3;
}

/** The model is deliberately waiting on the user — never force past an ask. */
function awaitingUser(text: string, toolNames: string[]): boolean {
  return toolNames.includes("clarify") || toolNames.includes("ask_user") || /\?\s*$/.test(text.trim());
}

export type AutoContinueArgs = {
  result: CompletionResult;
  messages: Message[];
  autoContinues: number;
  toolNames: string[];
  deps: AgentDeps;
};

/**
 * Decide whether a would-be "done" (text, no tool calls) should instead continue.
 * Fires only when the model DID work this turn and is not waiting on the user, and
 * either announced more work (cheap signal) or — with VANTA_VERIFY=1 — failed the
 * completion verifier on an explicit done-claim. Bounded by autoContinueMax.
 */
export async function shouldAutoContinue(args: AutoContinueArgs): Promise<boolean> {
  const { result, messages, autoContinues, toolNames, deps } = args;
  const env = process.env;
  if (autoContinues >= autoContinueMax(env)) return false;
  if (toolNames.length === 0) return false; // a pure answer, not a stalled task
  if (awaitingUser(result.text, toolNames)) return false;
  if (looksUnfinished(result.text)) return true;
  if (env.VANTA_VERIFY === "1") {
    const verdict = await runCompletionVerifier(
      { messages, taskDescription: deps.activeGoalText },
      { provider: deps.provider, env },
    ).then((r) => r.verdict).catch(() => "pass");
    return verdict === "fail";
  }
  return false;
}
