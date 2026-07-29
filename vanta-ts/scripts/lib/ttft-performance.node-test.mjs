import assert from "node:assert/strict";
import test from "node:test";
import {
  TTFT_METRICS,
  TTFT_PROFILE_MODES,
  TTFT_SURFACES,
  baselineEligibility,
  buildTtftReceipt,
  evaluateTtftBudgets,
  percentile,
  sampleMetrics,
  summarizeSamples,
  ttftFailureMessage,
} from "./ttft-performance.mjs";

function sample(surface, profileMode, offset = 0, providerMode = "live") {
  const timestamps = {
    processStartedAtMs: 0,
    interactiveAtMs: 100 + offset,
    submittedAtMs: 200 + offset,
    providerDispatchAtMs: 220 + offset,
    providerFirstDeltaAtMs: 300 + offset,
    firstPaintedAtMs: 310 + offset,
  };
  return {
    surface,
    profileMode,
    providerMode,
    packaged: surface === "desktop",
    signed: surface === "desktop",
    timestamps,
    metrics: sampleMetrics(timestamps),
  };
}

function completeSamples(providerMode = "live") {
  return TTFT_SURFACES.flatMap((surface) => TTFT_PROFILE_MODES.flatMap((mode) =>
    Array.from({ length: 5 }, (_, index) => sample(surface, mode, index, providerMode))));
}

test("derives ordered stage durations without prompt or output content", () => {
  assert.deepEqual(sample("tui", "fresh").metrics, {
    processToInteractiveMs: 100,
    submitToDispatchMs: 20,
    providerToFirstDeltaMs: 80,
    deltaToFirstPaintMs: 10,
    submitToFirstPaintMs: 110,
  });
  assert.throws(() => sampleMetrics({
    processStartedAtMs: 0, interactiveAtMs: 100, submittedAtMs: 200,
    providerDispatchAtMs: 190, providerFirstDeltaAtMs: 300, firstPaintedAtMs: 310,
  }), /stage order/);
});

test("reports nearest-rank median, p95, and worst from at least five samples", () => {
  assert.equal(percentile([1, 2, 3, 4, 100], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 100], 95), 100);
  const summary = summarizeSamples(Array.from({ length: 5 }, (_, index) => sample("cli", "fresh", index)));
  assert.deepEqual(summary.submitToDispatchMs, { median: 20, p95: 20, worst: 20, samples: [20, 20, 20, 20, 20] });
  assert.throws(() => summarizeSamples([sample("cli", "fresh")]), /at least five/);
});

test("refuses mocked providers and incomplete or unsigned desktop groups", () => {
  assert.equal(baselineEligibility(completeSamples()).ok, true);
  const mocked = baselineEligibility(completeSamples("fixture"));
  assert.equal(mocked.ok, false);
  assert.match(mocked.errors.join("\n"), /cannot establish TTFT/);
  const incomplete = completeSamples().slice(1);
  assert.equal(baselineEligibility(incomplete).ok, false);
  const unsigned = completeSamples();
  unsigned.find((entry) => entry.surface === "desktop").signed = false;
  assert.match(baselineEligibility(unsigned).errors.join("\n"), /signed app/);
});

test("builds a versioned baseline and names the regressed group and stage", () => {
  const receipt = buildTtftReceipt({
    samples: completeSamples(),
    machine: { platform: "darwin", arch: "arm64" },
    build: { sha: "abc" },
    createdAt: "2026-07-29T00:00:00.000Z",
  });
  assert.equal(receipt.version, 1);
  assert.equal(receipt.eligibleBaseline, true);
  const groups = Object.fromEntries(Object.entries(receipt.groups).map(([id, group]) => [
    id,
    Object.fromEntries(TTFT_METRICS.map((metric) => [metric, {
      baselineP95: group.summary[metric].p95,
      regressionPercent: 10,
      maxP95: metric === "providerToFirstDeltaMs" && id === "tui:fresh" ? 50 : 10_000,
    }])),
  ]));
  const result = evaluateTtftBudgets(receipt, { version: 1, groups });
  assert.equal(result.passed, false);
  assert.match(ttftFailureMessage(result), /tui:fresh providerToFirstDeltaMs/);
});
