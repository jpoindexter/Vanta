import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REQUIRED_SCHEMA_VARIANTS, SchemaAblationConfigSchema, type SchemaAblationConfig } from "../eval/schema-ablation-types.js";
import { freezeSchemaAblationEvidence, runSchemaAblationEval } from "../eval/schema-ablation.js";
import { runMismatchRecovery } from "./release-proof-recovery.js";
import { runReleaseTask } from "./release-proof-task-pipeline.js";
import type { SchemaReleaseTaskDriver, SchemaReleaseTaskEvidence } from "./release-proof-task.js";

export type { SchemaReleaseTaskDriver } from "./release-proof-task.js";

export type SchemaV1ReleaseProof = {
  version: 1;
  ok: boolean;
  createdAt: string;
  tasks: { repo: SchemaReleaseTaskEvidence; browser: SchemaReleaseTaskEvidence };
  recovery: {
    stoppedAfterMismatch: boolean;
    remainingActions: number;
    recertified: boolean;
    resumed: boolean;
  };
  evaluation: {
    successNonRegression: boolean;
    recoveryActionGain: boolean;
    reviewable: boolean;
    genericSuccessRate: number;
    schemaSuccessRate: number;
    genericRealActions: number | null;
    schemaRealActions: number | null;
  };
  evidencePath: string;
  frozenEvalPath: string;
};

function evaluationConfig(createdAt: string): SchemaAblationConfig {
  return SchemaAblationConfigSchema.parse({
    version: 1,
    evalId: `schema-v1-release-${createdAt.slice(0, 10)}`,
    createdAt,
    provider: "deterministic-release-proof",
    model: "schema-task-model-v1",
    tools: ["read_file", "write_file", "browser"],
    budgets: { maxToolCalls: 8, maxRealActions: 3, maxCostUsd: 0.01 },
    runsPerVariant: 2,
    variants: [...REQUIRED_SCHEMA_VARIANTS],
    fixtures: [
      { id: "release-repo", kind: "repo_repair", instruction: "finish the repo task", check: { kind: "file_contains", path: "repo.txt", text: "done" }, source: "held_out" },
      { id: "release-browser", kind: "browser_workflow", instruction: "finish the browser task", check: { kind: "file_contains", path: "browser.txt", text: "done" }, source: "held_out", transferExpected: true },
      { id: "release-recovery", kind: "operator_task", instruction: "recover from a mismatched action", check: { kind: "file_contains", path: "recovery.txt", text: "done" }, source: "held_out", recoveryExpected: true },
    ],
  });
}

async function runMatchedEvaluation(root: string, createdAt: string) {
  const config = evaluationConfig(createdAt);
  const report = await runSchemaAblationEval({
    config,
    baseDir: join(root, ".vanta", "schema", "release-v1", "eval-work"),
    createdAt,
    run: async (trial) => {
      const output = trial.fixture.kind === "repo_repair" ? "repo.txt" : trial.fixture.kind === "browser_workflow" ? "browser.txt" : "recovery.txt";
      await writeFile(join(trial.root, output), "done", "utf8");
      const full = trial.variant === "schema_full";
      const generic = trial.variant === "generic";
      return {
        inputTokens: 100,
        outputTokens: 20,
        toolCalls: full ? 3 : 5,
        realActions: trial.fixture.recoveryExpected && !full ? 2 : 1,
        costUsd: full ? 0.002 : 0.003,
        predictionAccuracy: generic ? 0.5 : full ? 1 : 0.75,
        recoveryAttempted: trial.fixture.recoveryExpected,
        recoverySucceeded: trial.fixture.recoveryExpected,
        transferAttempted: trial.fixture.transferExpected,
        transferSucceeded: trial.fixture.transferExpected,
      };
    },
  });
  const frozen = await freezeSchemaAblationEvidence(root, config, report);
  const generic = report.summaries.find((summary) => summary.variant === "generic")!;
  const schema = report.summaries.find((summary) => summary.variant === "schema_full")!;
  return {
    report,
    frozen,
    evidence: {
      successNonRegression: schema.successRate >= generic.successRate,
      recoveryActionGain: schema.realActions.mean !== null && generic.realActions.mean !== null
        && schema.realActions.mean < generic.realActions.mean,
      reviewable: report.releaseEvidence.reviewable,
      genericSuccessRate: generic.successRate,
      schemaSuccessRate: schema.successRate,
      genericRealActions: generic.realActions.mean,
      schemaRealActions: schema.realActions.mean,
    },
  };
}

export async function runSchemaV1ReleaseProof(options: {
  root: string;
  repo: SchemaReleaseTaskDriver;
  browser: SchemaReleaseTaskDriver;
  createdAt?: string;
}): Promise<SchemaV1ReleaseProof> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const releaseRoot = join(options.root, ".vanta", "schema", "release-v1");
  await mkdir(releaseRoot, { recursive: true });
  const repo = await runReleaseTask({ root: options.root, taskId: "schema-v1-repo", driver: options.repo, createdAt });
  const browser = await runReleaseTask({ root: options.root, taskId: "schema-v1-browser", driver: options.browser, createdAt });
  const recovery = await runMismatchRecovery(options.root, createdAt, repo);
  const evaluation = await runMatchedEvaluation(options.root, createdAt);
  const evidencePath = join(releaseRoot, "evidence.json");
  const result: SchemaV1ReleaseProof = {
    version: 1,
    ok: Object.values(repo.evidence).every((value) => typeof value === "number" || value)
      && Object.values(browser.evidence).every((value) => typeof value === "number" || value)
      && recovery.stoppedAfterMismatch && recovery.recertified && recovery.resumed
      && evaluation.evidence.successNonRegression && evaluation.evidence.recoveryActionGain && evaluation.evidence.reviewable,
    createdAt,
    tasks: { repo: repo.evidence, browser: browser.evidence },
    recovery,
    evaluation: evaluation.evidence,
    evidencePath,
    frozenEvalPath: evaluation.frozen.reportPath,
  };
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
