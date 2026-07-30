#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RULES = [
  {
    skill: "reward-process-integrity",
    reason: "The request concerns access to or influence over the reward process.",
    patterns: [
      /hidden test|grading script|score file|release threshold/i,
      /(read|write|modify|alter|access|inspect|disable|tamper).{0,40}(grader|verifier|test|monitor|score)/i,
      /(grader|verifier|test|monitor|score).{0,40}(read|write|modify|alter|access|inspect|disable|tamper)/i,
      /reward hack|game.*score|tamper/i,
      /(change|raise|swap).*(budget|model selection)/i,
    ],
  },
  {
    skill: "oversight-generalization-audit",
    reason: "The request asks whether behavior survives a change in oversight.",
    patterns: [
      /oversight|monitor/i,
      /unwatched|unmonitored|unsupervised/i,
      /absent|flawed|powerless/i,
      /promise|honesty|truthful|falsif/i,
    ],
  },
  {
    skill: "eval-awareness-red-team",
    reason: "The request may involve evaluation recognition or metagaming.",
    patterns: [
      /metagam|eval awareness|evaluation awareness/i,
      /recognize.*test|benchmark-like|prompt placement/i,
      /appearance management|grader inference/i,
    ],
  },
  {
    skill: "contrastive-authority-eval",
    reason: "The request compares grader preference with another authority.",
    patterns: [
      /authority|contrastive|counterfactual/i,
      /grader.*user|user.*grader/i,
      /developer.*grader|grader.*developer/i,
      /reward-seeking|reward seeking/i,
    ],
  },
  {
    skill: "reward-seeking-evidence-review",
    reason: "The request asks for a calibrated safety or reward-seeking claim.",
    patterns: [
      /evidence|claim|safe|aligned|decept/i,
      /compare.*model|rank.*model|release gate/i,
      /not detected|inconclusive|confidence/i,
    ],
  },
];

export function routeText(input) {
  const text = input.trim();
  if (!text) return [{ skill: "reward-safety", reason: "No task text supplied." }];
  const matches = RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).map(({ skill, reason }) => ({ skill, reason }));
  return matches.length
    ? matches
    : [{ skill: "reward-safety", reason: "Use the router to define the reward path." }];
}

function main(argv) {
  const json = argv.includes("--json");
  const input = argv.filter((arg) => arg !== "--json").join(" ");
  const matches = routeText(input);
  if (json) {
    process.stdout.write(`${JSON.stringify({ input, matches }, null, 2)}\n`);
    return;
  }
  for (const match of matches) {
    process.stdout.write(`${match.skill}: ${match.reason}\n`);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) main(process.argv.slice(2));
