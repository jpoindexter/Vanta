import type { Message } from "../types.js";
import type { TurnState } from "./turn-state.js";

export type AdaptiveSignal =
  | "activation"
  | "complex-task"
  | "correction"
  | "low-bandwidth"
  | "reorientation";

export type AdaptiveSupportPlan = {
  actionRequested: boolean;
  signals: AdaptiveSignal[];
  directive: string;
};

const ACTIVATION = /\b(?:i(?:['’]?m| am)?\s+stuck|can(?:not|['’]?t)\s+(?:start|begin|do this)|where do i start|help me start|cannot get started)\b/i;
const LOW_BANDWIDTH = /\b(?:overwhelm(?:ed|ing)?|too much|low (?:energy|capacity)|exhausted|burned? out|tldr|tl;dr|keep it (?:short|simple)|one thing at a time)\b/i;
const REORIENT = /\b(?:what(?:['’]?s| is) (?:next|left)|where (?:are|were) we|what were we doing|continue from where|remind me what|lost track)\b/i;
const CORRECTION = /\b(?:i (?:already )?said|still (?:not|doesn['’]?t|isn['’]?t)|again[, :]|not what i asked|wrong (?:thing|direction)|you missed|(?:you|u) (?:didn['’]?t|aren['’]?t)|why (?:didn['’]?t|aren['’]?t|isn['’]?t))\b/i;
const ACTION = /\b(?:add|build|change|clear|create|deploy|edit|encode|finish|fix|implement|install|make|move|open|push|release|remove|rename|rewrite|ship|test|update|wire)\b/i;
const COMPLEX = /(?:\b(?:across|all|entire|everything|full|whole)\b.*\b(?:app|codebase|docs|project|repo|system)\b|\b(?:end[- ]to[- ]end|multi[- ]step)\b|(?:^|\n)\s*(?:[-*]|\d+[.)])\s+)/im;

function recentUserText(history: Message[], count = 3): string {
  return history
    .filter((message) => message.role === "user")
    .slice(-count)
    .map((message) => message.content)
    .join("\n");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function buildDirective(signals: AdaptiveSignal[]): string {
  if (signals.length === 0) return "";
  const actions: string[] = [];
  if (signals.includes("correction")) {
    actions.push("Acknowledge the mismatch in one line, restate the corrected outcome, and change approach before doing more work.");
  }
  if (signals.includes("low-bandwidth")) {
    actions.push("Reduce output and optional scope. Present one active action; preserve safety and the requested function.");
  }
  if (signals.includes("activation")) {
    actions.push("Do not give a motivational lecture. Begin the smallest safe reversible action when tools allow; otherwise prescribe exactly one launch step.");
  }
  if (signals.includes("reorientation")) {
    actions.push("Externalize Outcome / Done / Now / Next / Blocker from available context so the operator does not reconstruct it.");
  }
  if (signals.includes("complex-task")) {
    actions.push("Keep one active step and a bounded sequence. Execute the first useful step instead of expanding the plan.");
  }
  return [
    "[VANTA AUTOMATIC SUPPORT — private turn directive]",
    `Observed interaction/task signals: ${signals.join(", ")}.`,
    ...actions.map((action) => `- ${action}`),
    "- Explicit /support profile values remain binding. Treat these signals as turn-local; do not diagnose, label, or store them as user traits.",
  ].join("\n");
}

/** Classify observable interaction/task friction. No model and no identity inference. */
export function detectAdaptiveSupport(userText: string, history: Message[]): AdaptiveSupportPlan {
  const recent = recentUserText(history);
  const signals: AdaptiveSignal[] = [];
  if (ACTIVATION.test(userText)) signals.push("activation");
  if (LOW_BANDWIDTH.test(userText)) signals.push("low-bandwidth");
  if (REORIENT.test(userText)) signals.push("reorientation");
  if (CORRECTION.test(`${recent}\n${userText}`)) signals.push("correction");
  if (COMPLEX.test(userText)) signals.push("complex-task");
  const distinct = unique(signals);
  return { actionRequested: ACTION.test(userText), signals: distinct, directive: buildDirective(distinct) };
}

/** Add a private per-call system directive without mutating the saved transcript. */
export function injectAdaptiveSupport(messages: Message[], directives: string[]): Message[] {
  const active = directives.filter((directive) => directive.trim());
  if (active.length === 0) return messages;
  const systemEnd = messages.findIndex((message) => message.role !== "system");
  const at = systemEnd === -1 ? messages.length : systemEnd;
  const note: Message = { role: "system", content: active.join("\n\n") };
  return [...messages.slice(0, at), note, ...messages.slice(at)];
}

const READ_ONLY = /^(?:brain|find|git_diff|git_status|glob|grep|inspect|list|read|recall|search|web_fetch|web_search)/;

/** One bounded self-correction when the live tool loop shows objective drift. */
export function detectAdaptiveRedirect(plan: AdaptiveSupportPlan, state: TurnState): string {
  if (state.adaptiveRedirects > 0) return "";
  if (state.consecutiveFailures >= 2 || Math.max(0, ...state.callCounts.values()) >= 2) {
    return [
      "[VANTA SELF-REDIRECT — private loop directive]",
      "The current approach is repeating or failing. Stop, inspect the latest evidence, name the blocker, and choose a materially different smallest safe action. Do not repeat the same call.",
    ].join("\n");
  }
  const researchOnly = state.toolIterations >= 6 && state.toolNames.every((name) => READ_ONLY.test(name));
  if (plan.actionRequested && researchOnly) {
    return [
      "[VANTA SELF-REDIRECT — private loop directive]",
      "The operator requested an action, but this turn has only researched. Stop expanding context, state the useful finding in one line, and execute the smallest safe action now. If blocked, report the exact blocker and one unblock step.",
    ].join("\n");
  }
  return "";
}
