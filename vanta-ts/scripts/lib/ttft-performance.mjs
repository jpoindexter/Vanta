export const TTFT_RECEIPT_VERSION = 1;
export const TTFT_SURFACES = ["cli", "tui", "gateway", "desktop"];
export const TTFT_PROFILE_MODES = ["fresh", "warm"];
export const TTFT_METRICS = [
  "processToInteractiveMs",
  "submitToDispatchMs",
  "providerToFirstDeltaMs",
  "deltaToFirstPaintMs",
  "submitToFirstPaintMs",
];

export async function settleBefore(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${label} after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function sampleMetrics(timestamps) {
  const required = [
    "processStartedAtMs",
    "interactiveAtMs",
    "submittedAtMs",
    "providerDispatchAtMs",
    "providerFirstDeltaAtMs",
    "firstPaintedAtMs",
  ];
  for (const key of required) {
    if (!Number.isFinite(timestamps[key])) throw new TypeError(`TTFT timestamp is missing: ${key}`);
  }
  const metrics = {
    processToInteractiveMs: timestamps.interactiveAtMs - timestamps.processStartedAtMs,
    submitToDispatchMs: timestamps.providerDispatchAtMs - timestamps.submittedAtMs,
    providerToFirstDeltaMs: timestamps.providerFirstDeltaAtMs - timestamps.providerDispatchAtMs,
    deltaToFirstPaintMs: timestamps.firstPaintedAtMs - timestamps.providerFirstDeltaAtMs,
    submitToFirstPaintMs: timestamps.firstPaintedAtMs - timestamps.submittedAtMs,
  };
  for (const [key, value] of Object.entries(metrics)) {
    if (value < 0) throw new RangeError(`TTFT stage order is invalid at ${key}`);
  }
  return metrics;
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 5) throw new Error("TTFT groups require at least five isolated samples");
  return Object.fromEntries(TTFT_METRICS.map((metric) => {
    const values = samples.map((sample) => Number(sample.metrics[metric]));
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new TypeError(`invalid TTFT metric: ${metric}`);
    return [metric, { median: round(percentile(values, 50)), p95: round(percentile(values, 95)), worst: round(Math.max(...values)), samples: values.map(round) }];
  }));
}

export function buildTtftReceipt({ samples, machine, build, createdAt = new Date().toISOString() }) {
  const groups = {};
  for (const surface of TTFT_SURFACES) {
    for (const profileMode of TTFT_PROFILE_MODES) {
      const id = `${surface}:${profileMode}`;
      const selected = samples.filter((sample) => sample.surface === surface && sample.profileMode === profileMode);
      groups[id] = { surface, profileMode, sampleCount: selected.length, summary: selected.length >= 5 ? summarizeSamples(selected) : null };
    }
  }
  const eligibility = baselineEligibility(samples);
  return {
    version: TTFT_RECEIPT_VERSION,
    createdAt,
    machine,
    build,
    provenance: { providerMode: eligibility.providerMode, containsMockedProvider: eligibility.containsMockedProvider },
    eligibleBaseline: eligibility.ok,
    eligibilityErrors: eligibility.errors,
    groups,
    samples,
  };
}

export function baselineEligibility(samples) {
  const errors = [];
  for (const surface of TTFT_SURFACES) {
    for (const profileMode of TTFT_PROFILE_MODES) {
      const selected = samples.filter((sample) => sample.surface === surface && sample.profileMode === profileMode);
      if (selected.length < 5) errors.push(`${surface}:${profileMode} has ${selected.length}/5 samples`);
    }
  }
  const containsMockedProvider = samples.some((sample) => sample.providerMode !== "live");
  if (containsMockedProvider) errors.push("mocked or fixture provider samples cannot establish TTFT");
  const desktop = samples.filter((sample) => sample.surface === "desktop");
  if (desktop.some((sample) => sample.packaged !== true)) errors.push("desktop samples must use a packaged app");
  if (desktop.some((sample) => sample.signed !== true)) errors.push("desktop samples must use a signed app");
  return {
    ok: errors.length === 0,
    errors,
    containsMockedProvider,
    providerMode: containsMockedProvider ? "mixed-or-mocked" : "live",
  };
}

export function evaluateTtftBudgets(receipt, config) {
  if (!receipt.eligibleBaseline) {
    return { passed: false, results: [], errors: ["receipt is not eligible for TTFT regression gating", ...receipt.eligibilityErrors] };
  }
  const results = [];
  for (const [groupId, group] of Object.entries(receipt.groups)) {
    const budgets = config.groups?.[groupId];
    if (!budgets || !group.summary) {
      results.push({ group: groupId, metric: "*", passed: false, reason: "budget or sample summary is missing" });
      continue;
    }
    for (const metric of TTFT_METRICS) {
      const budget = budgets[metric];
      const value = group.summary[metric].p95;
      if (!budget) {
        results.push({ group: groupId, metric, passed: false, reason: "budget is missing" });
        continue;
      }
      const regressionLimit = budget.baselineP95 * (1 + budget.regressionPercent / 100);
      const allowed = Math.min(budget.maxP95, regressionLimit);
      results.push({
        group: groupId,
        metric,
        value,
        allowed: round(allowed),
        passed: value <= allowed,
        reason: `${groupId} ${metric} p95 ${value}ms; allowed ${round(allowed)}ms (baseline ${budget.baselineP95}ms, ${budget.regressionPercent}% regression, hard max ${budget.maxP95}ms)`,
      });
    }
  }
  return { passed: results.every((result) => result.passed), results, errors: [] };
}

export function ttftFailureMessage(result) {
  return [...(result.errors ?? []), ...result.results.filter((entry) => !entry.passed).map((entry) => entry.reason)].join("\n");
}

export function percentile(values, pct) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("percentile requires finite samples");
  }
  if (pct < 0 || pct > 100) throw new RangeError("percentile must be between 0 and 100");
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil((pct / 100) * ordered.length) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
