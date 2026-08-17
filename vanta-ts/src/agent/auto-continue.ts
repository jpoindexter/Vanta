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

export function buildContinueNudge(openTodoCount: number | null = null): string {
  if (!openTodoCount || openTodoCount <= 0) return CONTINUE_NUDGE;
  return `Continue — your live checklist still has ${openTodoCount} open item${openTodoCount === 1 ? "" : "s"}. ` +
    "Finish the next item now, update the checklist as work completes, and only return after every completed item is marked done. " +
    "If a decision only the user can make genuinely blocks progress, call clarify or ask_user.";
}

// Signals the model announced more work but stopped (without an explicit completion claim).
const CONTINUE_SIGNAL_RE =
  /\b(next step|not (?:done|finished|complete)|haven['’]?t .{0,80}\byet|i['’]?(?:ll| will) finish|i['’]?ll now|i will now|then i['’]?ll|then i will|continuing|proceed(?:ing)? to|remaining (?:step|item)|still (?:need|have) to|step \d|i['’]?ll continue|moving on to|let me (?:now )?(?:do|run|build|continue|start|write|create|gather|fetch|read|check))\b|^\s*[-*]\s*\[ \]/im;

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
  openTodoCount?: number | null;
};

/**
 * Decide whether a would-be "done" (text, no tool calls) should instead continue.
 * Fires only when the model DID work this turn and is not waiting on the user, and
 * either announced more work (cheap signal), has an observed open checklist, or
 * — with VANTA_VERIFY=1 — failed the completion verifier on an explicit
 * done-claim. Generic nudges are bounded by autoContinueMax; a live checklist
 * remains governed by runTurn's hard iteration and tool-budget boundaries.
 */
export async function shouldAutoContinue(args: AutoContinueArgs): Promise<boolean> {
  const { result, messages, autoContinues, toolNames, deps, openTodoCount } = args;
  const env = process.env;
  const max = autoContinueMax(env);
  if (max === 0) return false;
  if (toolNames.length === 0) return false; // a pure answer, not a stalled task
  if (awaitingUser(result.text, toolNames)) return false;
  // The generic nudge cap prevents repeatedly second-guessing a model that has
  // not declared a plan. A live checklist is stronger state: returning `done`
  // while it remains open is internally inconsistent. Keep the bounded turn
  // alive; runTurn's existing max-iteration and tool-budget ceilings still
  // provide hard stops.
  if (openTodoCount && openTodoCount > 0) return true;
  if (autoContinues >= max) return false;
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
