import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCounterexampleEpisode } from "../schema/counterexample.js";
import type { ControlledCommitResult } from "../schema/controlled-commit.js";
import { schemaRecovery } from "./schema-recovery-cmd.js";
import type { ReplCtx } from "./types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("/schema-recovery", () => {
  it("shows the latest classified mismatch and safe next action", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-schema-repl-test-"));
    roots.push(root);
    const result: ControlledCommitResult = {
      ok: false,
      records: [],
      error: {
        code: "prediction_mismatch",
        message: "mismatch",
        counterexample: { modelVersion: 3, runId: "run", sequence: 8, path: "$.ready", predicted: false, observed: true },
      },
    };
    await openCounterexampleEpisode(root, {
      planId: "plan-cli", actions: [{ action: {}, risk: "low", reason: "queued" }], result,
      createdAt: "2026-07-17T03:00:00.000Z",
    });
    const response = await schemaRecovery("", { dataDir: root } as ReplCtx);
    expect(response.output).toContain("Schema recovery: open");
    expect(response.output).toContain("Mismatch: $.ready");
    expect(response.output).toContain("Safe next action: revise state or model");
  });
});
