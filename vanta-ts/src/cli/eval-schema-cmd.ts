import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createConversation } from "../agent.js";
import { runSchemaAblationEval, freezeSchemaAblationEvidence, type SchemaTrialRunner } from "../eval/schema-ablation.js";
import { SchemaAblationConfigSchema, type SchemaAblationReport } from "../eval/schema-ablation-types.js";
import { estimateCostUsd } from "../pricing.js";
import { prepareRun, buildSummarizer } from "../session.js";
import { InMemoryToolRegistry } from "../tools/registry.js";

const DEFAULT_CONFIG = join("eval", "schema-ablation.json");
const REAL_ACTION_TOOLS = new Set([
  "browser_act", "browser_navigate", "calendar_create", "calendar_update", "drive_create", "drive_update",
  "edit_file", "git_branch", "git_checkout", "git_commit", "git_push", "gmail_draft", "gmail_send",
  "payment_transaction", "roadmap_add", "roadmap_move", "shell_cmd", "write_file", "write_skill",
]);

export function isSchemaRealActionTool(name: string): boolean {
  return REAL_ACTION_TOOLS.has(name);
}

export function buildLiveSchemaTrialRunner(repoRoot: string): SchemaTrialRunner {
  return async (trial) => {
    const setup = await prepareRun(repoRoot, trial.instruction);
    const route = setup.provider.routeInfo?.();
    if (setup.provider.modelId() !== trial.model) throw new Error(`matched eval model mismatch: configured ${trial.model}, live ${setup.provider.modelId()}`);
    if (!route || route.provider !== trial.provider) throw new Error(`matched eval provider mismatch: configured ${trial.provider}, live ${route?.provider ?? "unknown"}`);
    const registry = new InMemoryToolRegistry(new Set(trial.tools));
    for (const tool of setup.registry.list()) registry.register(tool);
    const liveTools = registry.schemas().map((tool) => tool.name).sort();
    const expectedTools = [...trial.tools].sort();
    if (JSON.stringify(liveTools) !== JSON.stringify(expectedTools)) throw new Error(`matched eval tool mismatch: expected ${expectedTools.join(", ")}; live ${liveTools.join(", ")}`);

    let toolCalls = 0;
    let realActions = 0;
    let sawFailure = false;
    let recoveredAfterFailure = false;
    const conversation = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry,
      root: trial.root,
      sessionId: trial.sessionId,
      requestApproval: async () => true,
      maxIterations: trial.budgets.maxToolCalls,
      summarize: buildSummarizer(setup.provider),
      onToolCall: () => { toolCalls += 1; },
      onToolResult: (name, ok) => {
        if (!ok) sawFailure = true;
        if (ok && sawFailure) recoveredAfterFailure = true;
        if (ok && isSchemaRealActionTool(name)) realActions += 1;
      },
    });
    const outcome = await conversation.send(trial.instruction);
    const inputTokens = outcome.usage?.inputTokens ?? 0;
    const outputTokens = outcome.usage?.outputTokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      toolCalls,
      realActions,
      costUsd: estimateCostUsd(trial.model, inputTokens, outputTokens),
      predictionAccuracy: null,
      recoveryAttempted: sawFailure,
      recoverySucceeded: sawFailure && recoveredAfterFailure,
      transferAttempted: false,
      transferSucceeded: false,
    };
  };
}

export function formatSchemaAblationReport(report: SchemaAblationReport): string {
  const lines = report.summaries.map((summary) => {
    const cost = summary.costUsd.mean === null ? "unpriced" : `$${summary.costUsd.mean.toFixed(4)} mean`;
    const prediction = summary.predictionAccuracy.mean === null ? "prediction unmeasured" : `${(summary.predictionAccuracy.mean * 100).toFixed(1)}% prediction`;
    return `  ${summary.variant}: ${(summary.successRate * 100).toFixed(1)}% success · ${summary.toolCalls.mean?.toFixed(1) ?? "?"} tools · ${summary.realActions.mean?.toFixed(1) ?? "?"} real actions · ${cost} · ${prediction}`;
  });
  lines.push(`  release evidence: ${report.releaseEvidence.reviewable ? "reviewable" : "not reviewable"} · release claimed: no`);
  for (const reason of report.releaseEvidence.reasons) lines.push(`    - ${reason}`);
  return lines.join("\n");
}

export async function runSchemaAblationCommand(
  repoRoot: string,
  rest: string[] = [],
  dependencies: { run?: SchemaTrialRunner; now?: string } = {},
): Promise<SchemaAblationReport> {
  const configPath = resolve(repoRoot, rest[0] ?? DEFAULT_CONFIG);
  const config = SchemaAblationConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  console.log(`vanta eval schema: ${config.fixtures.length} fixtures × ${config.runsPerVariant} runs × ${config.variants.length} variants\n`);
  const report = await runSchemaAblationEval({ config, baseDir: join(repoRoot, ".vanta", "eval-runs"), run: dependencies.run ?? buildLiveSchemaTrialRunner(repoRoot), createdAt: dependencies.now });
  const frozen = await freezeSchemaAblationEvidence(repoRoot, config, report);
  console.log(formatSchemaAblationReport(report));
  console.log(`\nevidence → ${frozen.directory}`);
  return report;
}
