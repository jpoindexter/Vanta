import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  freezeSchemaAblationEvidence,
  hashSchemaAblationConfig,
  harnessInstruction,
  runSchemaAblationEval,
  type SchemaTrialRunner,
} from "./schema-ablation.js";
import {
  REQUIRED_SCHEMA_VARIANTS,
  SchemaAblationConfigSchema,
  type SchemaAblationConfig,
} from "./schema-ablation-types.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function config(overrides: Partial<SchemaAblationConfig> = {}): SchemaAblationConfig {
  return SchemaAblationConfigSchema.parse({
    version: 1,
    evalId: "schema-ablation-fixture",
    createdAt: "2026-07-17T00:00:00.000Z",
    provider: "fixture-provider",
    model: "fixture-model",
    tools: ["read_file", "write_file", "browser"],
    budgets: { maxToolCalls: 12, maxRealActions: 4, maxCostUsd: 0.25 },
    runsPerVariant: 2,
    variants: [...REQUIRED_SCHEMA_VARIANTS],
    fixtures: [
      { id: "repair", kind: "repo_repair", instruction: "repair the fixture", seed: { "broken.txt": "bad" }, check: { kind: "file_contains", path: "fixed.txt", text: "fixed" }, source: "held_out" },
      { id: "browser", kind: "browser_workflow", instruction: "complete the browser fixture", seed: { "page.html": "<button>Save</button>" }, check: { kind: "file_contains", path: "browser.txt", text: "saved" }, source: "held_out", transferExpected: true },
      { id: "operator", kind: "operator_task", instruction: "recover the operator task", check: { kind: "file_contains", path: "operator.txt", text: "recovered" }, source: "held_out", recoveryExpected: true },
    ],
    ...overrides,
  });
}

describe("Schema ablation contract", () => {
  it("requires the three held-out task classes, two fresh runs, and every ablation", () => {
    expect(() => config({ runsPerVariant: 1 })).toThrow();
    expect(() => config({ variants: REQUIRED_SCHEMA_VARIANTS.slice(0, -1) as never })).toThrow();
    expect(() => config({ fixtures: config().fixtures.filter((fixture) => fixture.kind !== "browser_workflow") })).toThrow();
  });

  it("changes only the harness layer between matched trials and reports variance, failures, and costs", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-schema-eval-"));
    roots.push(root);
    const seen = new Map<string, Set<string>>();
    const runner: SchemaTrialRunner = async (trial) => {
      const key = `${trial.fixture.id}:${trial.run}`;
      const controls = JSON.stringify({ provider: trial.provider, model: trial.model, tools: trial.tools, budgets: trial.budgets, instruction: trial.fixture.instruction });
      const controlsSeen = seen.get(key) ?? new Set<string>();
      controlsSeen.add(controls);
      seen.set(key, controlsSeen);
      const output = trial.fixture.kind === "repo_repair" ? "fixed.txt" : trial.fixture.kind === "browser_workflow" ? "browser.txt" : "operator.txt";
      writeFileSync(join(trial.root, output), trial.fixture.kind === "repo_repair" ? "fixed" : trial.fixture.kind === "browser_workflow" ? "saved" : "recovered", "utf8");
      return {
        inputTokens: 100,
        outputTokens: 20,
        toolCalls: trial.variant === "generic" ? 6 : 4,
        realActions: 1,
        costUsd: trial.variant === "generic" ? 0.03 : 0.02,
        predictionAccuracy: trial.variant === "generic" ? 0.5 : 0.9,
        recoveryAttempted: trial.fixture.recoveryExpected,
        recoverySucceeded: trial.fixture.recoveryExpected,
        transferAttempted: trial.fixture.transferExpected,
        transferSucceeded: trial.fixture.transferExpected,
      };
    };

    const report = await runSchemaAblationEval({ config: config(), baseDir: root, run: runner, createdAt: "2026-07-17T00:01:00.000Z" });
    expect(report.trials).toHaveLength(3 * 2 * REQUIRED_SCHEMA_VARIANTS.length);
    expect(new Set(report.trials.map((trial) => trial.sessionId)).size).toBe(report.trials.length);
    expect([...seen.values()].every((controls) => controls.size === 1)).toBe(true);
    expect(report.summaries.map((summary) => summary.variant)).toEqual(REQUIRED_SCHEMA_VARIANTS);
    expect(report.summaries.find((summary) => summary.variant === "generic")?.costUsd.mean).toBeCloseTo(0.03);
    expect(report.summaries.find((summary) => summary.variant === "schema_full")?.predictionAccuracy.mean).toBeCloseTo(0.9);
    expect(report.summaries.every((summary) => summary.costUsd.variance === 0)).toBe(true);
    expect(report.releaseEvidence).toEqual({ reviewable: true, releaseClaimed: false, reasons: ["Evidence is reviewable; release remains an explicit operator decision."] });
  });

  it("marks budget overruns as failed and refuses public or incomplete evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-schema-eval-budget-"));
    roots.push(root);
    const publicFixtures = config().fixtures.map((fixture) => ({ ...fixture, source: "public" as const }));
    const runner: SchemaTrialRunner = async (trial) => {
      const output = trial.fixture.kind === "repo_repair" ? "fixed.txt" : trial.fixture.kind === "browser_workflow" ? "browser.txt" : "operator.txt";
      writeFileSync(join(trial.root, output), trial.fixture.kind === "repo_repair" ? "fixed" : trial.fixture.kind === "browser_workflow" ? "saved" : "recovered", "utf8");
      return { inputTokens: 1, outputTokens: 1, toolCalls: 99, realActions: 1, costUsd: null, predictionAccuracy: null, recoveryAttempted: false, recoverySucceeded: false, transferAttempted: false, transferSucceeded: false };
    };
    const report = await runSchemaAblationEval({ config: config({ fixtures: publicFixtures }), baseDir: root, run: runner });
    expect(report.trials.every((trial) => !trial.success && trial.budgetExceeded.includes("tool_calls"))).toBe(true);
    expect(report.releaseEvidence.reviewable).toBe(false);
    expect(report.releaseEvidence.reasons.join(" ")).toMatch(/held-out|cost|prediction/i);
  });

  it("freezes replayable configs and artifacts without allowing conflicting overwrite", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-schema-evidence-"));
    roots.push(root);
    const report = {
      version: 1 as const,
      evalId: config().evalId,
      configHash: hashSchemaAblationConfig(config()),
      createdAt: "2026-07-17T00:01:00.000Z",
      trials: [],
      summaries: [],
      releaseEvidence: { reviewable: false, releaseClaimed: false as const, reasons: ["fixture"] },
    };
    const frozen = await freezeSchemaAblationEvidence(root, config(), report);
    expect(JSON.parse(readFileSync(frozen.configPath, "utf8")).evalId).toBe(config().evalId);
    expect(JSON.parse(readFileSync(frozen.reportPath, "utf8")).releaseEvidence.releaseClaimed).toBe(false);
    await expect(freezeSchemaAblationEvidence(root, config({ model: "changed" }), report)).rejects.toThrow(/immutable|conflict/i);
  });

  it("makes each ablation explicit in the harness instruction", () => {
    expect(harnessInstruction("schema_full")).toMatch(/timeline backtest.*commit gate.*probe planning.*model search/i);
    expect(harnessInstruction("no_commit_gate")).toMatch(/commit gate: disabled/i);
    expect(harnessInstruction("generic")).not.toMatch(/timeline backtest: enabled/i);
  });
});
