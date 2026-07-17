import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSchemaAblationCommand, formatSchemaAblationReport, isSchemaRealActionTool } from "./eval-schema-cmd.js";
import { REQUIRED_SCHEMA_VARIANTS } from "../eval/schema-ablation-types.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });

describe("vanta eval schema", () => {
  it("runs a frozen config through the existing sandbox harness and records evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-eval-schema-cli-"));
    roots.push(root);
    const config = {
      version: 1, evalId: "cli-fixture", createdAt: "2026-07-17T00:00:00.000Z", provider: "fixture", model: "fixture-model",
      tools: ["write_file"], budgets: { maxToolCalls: 4, maxRealActions: 2, maxCostUsd: 1 }, runsPerVariant: 2, variants: [...REQUIRED_SCHEMA_VARIANTS],
      fixtures: [
        { id: "repo", kind: "repo_repair", instruction: "repo", check: { kind: "file_exists", path: "repo.txt" }, source: "held_out" },
        { id: "web", kind: "browser_workflow", instruction: "web", check: { kind: "file_exists", path: "web.txt" }, source: "held_out" },
        { id: "ops", kind: "operator_task", instruction: "ops", check: { kind: "file_exists", path: "ops.txt" }, source: "held_out" },
      ],
    };
    writeFileSync(join(root, "config.json"), `${JSON.stringify(config)}\n`);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const report = await runSchemaAblationCommand(root, ["config.json"], {
      now: "2026-07-17T00:01:00.000Z",
      run: async (trial) => {
        writeFileSync(join(trial.root, `${trial.fixture.id}.txt`), "ok");
        return { inputTokens: 10, outputTokens: 2, toolCalls: 1, realActions: 1, costUsd: 0.01, predictionAccuracy: 1, recoveryAttempted: false, recoverySucceeded: false, transferAttempted: false, transferSucceeded: false };
      },
    });
    expect(report.trials).toHaveLength(36);
    expect(formatSchemaAblationReport(report)).toMatch(/schema_full: 100.0% success/);
    expect(existsSync(join(root, ".vanta", "eval-runs", "schema", "cli-fixture", "report.json"))).toBe(true);
  });

  it("classifies mutating tools without counting reads", () => {
    expect(isSchemaRealActionTool("write_file")).toBe(true);
    expect(isSchemaRealActionTool("browser_act")).toBe(true);
    expect(isSchemaRealActionTool("read_file")).toBe(false);
  });
});
