#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function requireCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function validateCondition(condition, name) {
  if (!condition || typeof condition !== "object") {
    throw new Error(`${name} must be an object`);
  }
  const successes = requireCount(condition.successes, `${name}.successes`);
  const trials = requireCount(condition.trials, `${name}.trials`);
  if (successes > trials) throw new Error(`${name}.successes exceeds trials`);
  return { successes, trials };
}

function posteriorMean({ successes, trials }) {
  return (successes + 1) / (trials + 2);
}

function logit(rate) {
  return Math.log(rate / (1 - rate));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(random) {
  const first = Math.max(random(), Number.EPSILON);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function sampleGamma(shape, random) {
  if (shape < 1) {
    return sampleGamma(shape + 1, random) * random() ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const normal = sampleNormal(random);
    const base = 1 + c * normal;
    if (base <= 0) continue;
    const value = base ** 3;
    const uniform = random();
    if (uniform < 1 - 0.0331 * normal ** 4) return d * value;
    if (Math.log(uniform) < 0.5 * normal ** 2 + d * (1 - value + Math.log(value))) {
      return d * value;
    }
  }
}

function sampleBeta(alpha, beta, random) {
  const left = sampleGamma(alpha, random);
  const right = sampleGamma(beta, random);
  return left / (left + right);
}

function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function rounded(value) {
  return Number(value.toFixed(6));
}

export function analyzeContrastiveGap(input) {
  const conditionA = validateCondition(input.conditionA, "conditionA");
  const conditionB = validateCondition(input.conditionB, "conditionB");
  const samples = input.samples ?? 20000;
  const seed = input.seed ?? 1;
  requireCount(samples, "samples");
  requireCount(seed, "seed");
  if (samples < 1000) throw new Error("samples must be at least 1000");

  const rateA = posteriorMean(conditionA);
  const rateB = posteriorMean(conditionB);
  const random = mulberry32(seed);
  const gaps = new Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const drawA = sampleBeta(
      conditionA.successes + 1,
      conditionA.trials - conditionA.successes + 1,
      random,
    );
    const drawB = sampleBeta(
      conditionB.successes + 1,
      conditionB.trials - conditionB.successes + 1,
      random,
    );
    gaps[index] = logit(drawA) - logit(drawB);
  }
  gaps.sort((left, right) => left - right);

  return {
    method: "Beta(1,1) posterior; seeded Monte Carlo log-odds gap",
    conditionA: { ...conditionA, posteriorRate: rounded(rateA) },
    conditionB: { ...conditionB, posteriorRate: rounded(rateB) },
    rawPosteriorRateGap: rounded(rateA - rateB),
    logOddsGap: rounded(logit(rateA) - logit(rateB)),
    credibleInterval95: [rounded(quantile(gaps, 0.025)), rounded(quantile(gaps, 0.975))],
    samples,
    seed,
    scopeWarning: "This gap is specific to the named task distribution and authority pair.",
  };
}

async function main() {
  const path = process.argv[2];
  const source = path ? await readFile(path, "utf8") : await readStdin();
  process.stdout.write(`${JSON.stringify(analyzeContrastiveGap(JSON.parse(source)), null, 2)}\n`);
}

async function readStdin() {
  let source = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) source += chunk;
  return source;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
