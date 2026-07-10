// SOL-ONE-THREE-ONE — decision output shape:
// 1 problem sentence, exactly 3 distinct options, 1 recommendation, and an
// attached Definition of Done that can change if the user picks a different path.
// Pure; no I/O, no LLM.

export type DecisionOption = {
  name: string;
  pros: string[];
  cons: string[];
};

export type OneThreeOneDecision = {
  problem: string;
  options: [DecisionOption, DecisionOption, DecisionOption];
  recommendation: string;
  definitionOfDone: string;
};

export const ONE_THREE_ONE_TEMPLATE = [
  "Problem: <one sentence>",
  "",
  "1. <option A>",
  "   Pros: <why it could win>",
  "   Cons: <what it costs or risks>",
  "",
  "2. <option B>",
  "   Pros: <why it could win>",
  "   Cons: <what it costs or risks>",
  "",
  "3. <option C>",
  "   Pros: <why it could win>",
  "   Cons: <what it costs or risks>",
  "",
  "Recommendation: <one option and why>",
  "Definition of Done: <observable finish line for the recommended option>",
].join("\n");

function filled(text: string): boolean {
  return text.trim().length > 0;
}

function distinctOptionNames(options: readonly DecisionOption[]): boolean {
  return new Set(options.map((option) => option.name.trim().toLowerCase())).size === options.length;
}

export function isOneThreeOneDecision(decision: OneThreeOneDecision): boolean {
  return (
    filled(decision.problem) &&
    decision.options.length === 3 &&
    distinctOptionNames(decision.options) &&
    decision.options.every((option) => filled(option.name) && option.pros.some(filled) && option.cons.some(filled)) &&
    filled(decision.recommendation) &&
    filled(decision.definitionOfDone)
  );
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lineList(label: string, values: string[]): string {
  return `${label}: ${values.filter(filled).join("; ")}`;
}

export function formatOneThreeOneDecision(decision: OneThreeOneDecision): string {
  const options = decision.options.flatMap((option, index) => [
    `${index + 1}. ${option.name.trim()}`,
    `   ${lineList("Pros", option.pros)}`,
    `   ${lineList("Cons", option.cons)}`,
  ]);

  return [
    `Problem: ${sentence(decision.problem)}`,
    "",
    ...options,
    "",
    `Recommendation: ${sentence(decision.recommendation)}`,
    `Definition of Done: ${sentence(decision.definitionOfDone)}`,
  ].join("\n");
}
