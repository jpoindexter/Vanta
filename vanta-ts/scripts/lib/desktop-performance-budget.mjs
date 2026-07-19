export const PERFORMANCE_METRICS = [
  "coldStartMs",
  "firstUseMs",
  "idleMemoryMb",
  "activeCpuPercent",
  "appAsarBytes",
  "unpackedResourceBytes",
  "installedSizeBytes",
];

export function evaluatePerformanceBudgets(metrics, config) {
  const results = PERFORMANCE_METRICS.map((name) => {
    const value = Number(metrics[name]);
    const budget = config.budgets[name];
    if (!Number.isFinite(value)) return { name, passed: false, value, allowed: 0, reason: "metric is missing" };
    if (!budget) return { name, passed: false, value, allowed: 0, reason: "budget is missing" };
    const regressionLimit = budget.baseline * (1 + budget.regressionPercent / 100);
    const allowed = Math.min(budget.max, regressionLimit);
    return {
      name,
      value,
      allowed,
      passed: value <= allowed,
      reason: `${name} ${format(value)}; allowed ${format(allowed)} (baseline ${format(budget.baseline)}, ${budget.regressionPercent}% regression, hard max ${format(budget.max)})`,
    };
  });
  return { passed: results.every((result) => result.passed), results };
}

export function performanceFailureMessage(result) {
  return result.results.filter((entry) => !entry.passed).map((entry) => entry.reason).join("\n");
}

function format(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
