import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveBenchResult, loadBenchResults, formatBenchScorecard, buildRoutingRecommendations, type BenchResult,
} from "./model-bench.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-bench-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

const SAMPLE: BenchResult = {
  model: "gpt-4o-mini",
  provider: "openai",
  taskKind: "coding",
  latencyMs: 1200,
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.001,
  qualityNote: "looks correct",
  recordedAt: new Date().toISOString(),
};

describe("saveBenchResult / loadBenchResults", () => {
  it("saves and loads a result", async () => {
    await saveBenchResult(SAMPLE, env);
    const loaded = await loadBenchResults(env);
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.model).toBe("gpt-4o-mini");
  });

  it("accumulates multiple results", async () => {
    await saveBenchResult(SAMPLE, env);
    await saveBenchResult({ ...SAMPLE, latencyMs: 2000 }, env);
    expect((await loadBenchResults(env)).length).toBe(2);
  });
});

describe("formatBenchScorecard", () => {
  it("returns empty message for no results", () => {
    expect(formatBenchScorecard([])).toContain("no benchmark results");
  });

  it("includes model + latency in output", async () => {
    await saveBenchResult(SAMPLE, env);
    const scorecard = formatBenchScorecard([SAMPLE]);
    expect(scorecard).toContain("gpt-4o-mini");
    expect(scorecard).toContain("1200ms");
  });
});

describe("buildRoutingRecommendations", () => {
  it("returns empty for no results", () => {
    expect(buildRoutingRecommendations([])).toEqual([]);
  });

  it("picks fastest model per task kind", () => {
    const fast: BenchResult = { ...SAMPLE, latencyMs: 500 };
    const slow: BenchResult = { ...SAMPLE, latencyMs: 2000 };
    const recs = buildRoutingRecommendations([slow, fast]);
    expect(recs[0]).toContain("500ms");
  });
});
