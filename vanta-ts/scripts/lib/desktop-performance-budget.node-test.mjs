import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePerformanceBudgets, performanceFailureMessage, PERFORMANCE_METRICS } from "./desktop-performance-budget.mjs";

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
