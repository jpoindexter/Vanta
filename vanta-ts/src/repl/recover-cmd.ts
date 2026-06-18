import type { Message } from "../types.js";
import type { SlashHandler } from "./types.js";

export type RecoverKind = "targeted-bug" | "polluted-context" | "wrong-assumption";
export type RecoverAction = "debug" | "compact-or-restart" | "revisit-plan";
export type RecoverDiagnosis = {
  kind: RecoverKind;
  action: RecoverAction;
  evidence: string[];
  nextStep: string;
};

type Scores = Record<RecoverKind, number>;
type Signal = { kind: RecoverKind; weight: number; text: string };

const RULES: Array<{ kind: RecoverKind; weight: number; re: RegExp; label: string }> = [
  { kind: "polluted-context", weight: 5, re: /\b(context|transcript).*(polluted|stale|contradict|confus)/i, label: "context quality was named as the problem" },
  { kind: "polluted-context", weight: 4, re: /\b(compact|restart|clear context|fresh session|lost track)\b/i, label: "session reset or compaction is being discussed" },
  { kind: "wrong-assumption", weight: 5, re: /\b(wrong assumption|bad assumption|misread|not what i asked|wrong direction)\b/i, label: "the goal or premise was corrected" },
  { kind: "wrong-assumption", weight: 3, re: /\b(requirements?|scope|plan|original goal|revisit)\b.*\b(wrong|off|miss|changed)\b/i, label: "plan/scope drift is visible" },
  { kind: "targeted-bug", weight: 4, re: /\b(error|exception|failed|failure|timeout|stack trace|tsc|vitest|test failed)\b/i, label: "a concrete tool or test failure is present" },
  { kind: "targeted-bug", weight: 3, re: /\b(typeerror|referenceerror|syntaxerror|enoent|eacces|exit code [1-9])\b/i, label: "a concrete runtime/compiler error is present" },
];

export function classifyRecovery(messages: readonly Message[]): RecoverDiagnosis {
  const signals = collectSignals(messages);
  const scores: Scores = { "targeted-bug": 1, "polluted-context": 0, "wrong-assumption": 0 };
  for (const s of signals) scores[s.kind] += s.weight;
  const kind = bestKind(scores);
  return {
    kind,
    action: actionFor(kind),
    evidence: evidenceFor(kind, signals),
    nextStep: nextStepFor(kind),
  };
}

export function formatRecovery(d: RecoverDiagnosis): string {
  return [
    `  recover: ${d.kind} -> ${d.action}`,
    `  next: ${d.nextStep}`,
    "  evidence:",
    ...d.evidence.map((e) => `  - ${e}`),
  ].join("\n");
}

export const recover: SlashHandler = (_arg, ctx) => ({
  output: formatRecovery(classifyRecovery(ctx.convo.messages)),
});

function collectSignals(messages: readonly Message[]): Signal[] {
  return messages.slice(-24).flatMap(signalsForMessage);
}

function signalsForMessage(message: Message): Signal[] {
  const text = "content" in message ? message.content : "";
  const roleBoost = message.role === "tool" ? 2 : 0;
  return RULES.flatMap((rule) => rule.re.test(text) ? [{ kind: rule.kind, weight: rule.weight + roleBoost, text: rule.label }] : []);
}

function bestKind(scores: Scores): RecoverKind {
  return (Object.entries(scores) as Array<[RecoverKind, number]>)
    .sort((a, b) => b[1] - a[1] || priority(a[0]) - priority(b[0]))[0]![0];
}

function priority(kind: RecoverKind): number {
  if (kind === "polluted-context") return 0;
  if (kind === "wrong-assumption") return 1;
  return 2;
}

function actionFor(kind: RecoverKind): RecoverAction {
  if (kind === "polluted-context") return "compact-or-restart";
  if (kind === "wrong-assumption") return "revisit-plan";
  return "debug";
}

function nextStepFor(kind: RecoverKind): string {
  if (kind === "polluted-context") return "compact with a corrected goal summary; restart if the contradiction survives.";
  if (kind === "wrong-assumption") return "stop coding, restate the original requirement, and revise the plan before more tools.";
  return "isolate the failing command or code path, reproduce once, then patch the smallest cause.";
}

function evidenceFor(kind: RecoverKind, signals: Signal[]): string[] {
  const evidence = signals.filter((s) => s.kind === kind).map((s) => s.text);
  return [...new Set(evidence)].slice(0, 3).concat(evidence.length ? [] : ["no stronger signal found; defaulting to a targeted debug pass"]);
}
