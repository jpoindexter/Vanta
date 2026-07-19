import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePerformanceBudgets, evaluateSampleHardMax, median, performanceFailureMessage, PERFORMANCE_METRICS } from "./desktop-performance-budget.mjs";

function config(max = 120) {
  return { budgets: Object.fromEntries(PERFORMANCE_METRICS.map((name) => [name, { baseline: 100, regressionPercent: 10, max }])) };
}

test("metrics within the regression and absolute limits pass", () => {
  const metrics = Object.fromEntries(PERFORMANCE_METRICS.map((name) => [name, 105]));
  assert.equal(evaluatePerformanceBudgets(metrics, config()).passed, true);
});

test("an intentional budget breach fails with the metric and limits", () => {
  const metrics = Object.fromEntries(PERFORMANCE_METRICS.map((name) => [name, name === "coldStartMs" ? 111 : 100]));
  const result = evaluatePerformanceBudgets(metrics, config());
  assert.equal(result.passed, false);
  assert.match(performanceFailureMessage(result), /coldStartMs 111; allowed 110/);
});

test("cold-start samples use their median rather than a noisy extreme", () => {
  assert.equal(median([7_500, 4_200, 4_500]), 4_500);
  assert.equal(median([4_200, 4_500]), 4_350);
  assert.throws(() => median([]), /at least one finite number/);
});

test("every cold-start sample remains subject to the hard ceiling", () => {
  assert.equal(evaluateSampleHardMax([7_500, 4_200, 4_500], 10_000).passed, true);
  const result = evaluateSampleHardMax([10_001, 4_200, 4_500], 10_000);
  assert.equal(result.passed, false);
  assert.equal(result.worst, 10_001);
});
