import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordSchemaQualityScorecard, SchemaQualityScorecardSchema } from "../schema/quality-ledger.js";
import { schemaQuality } from "./schema-quality-cmd.js";
import type { ReplCtx } from "./types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function scorecard(runId: string, beliefStatus: "exact" | "partial", createdAt: string) {
  return SchemaQualityScorecardSchema.parse({
    version: 1, runId, taskId: "quality-cli", createdAt,
    provenance: { modelVersion: 2, representationVersion: 1, sourceHash: "a".repeat(64), timelineHash: "b".repeat(64) },
    beliefStatus, certified: beliefStatus === "exact",
    coverage: { exact: beliefStatus === "exact" ? 2 : 0, partial: beliefStatus === "partial" ? 1 : 0, skipped: 0, untested: 0, contradicted: 0 },
    predictionErrorsByField: [], modelRevisions: 1, representationChanges: 0, probeCost: 0,
    simulatedSearch: { sandboxCalls: 3, expandedStates: 2, plansFound: 1 },
    realActions: { attempted: 1, committed: 1, verified: 1, efficiency: 1 },
    planAborts: 0, transfer: { attempted: 0, succeeded: 0, rate: 0 },
  });
}

describe("/schema-quality", () => {
  it("shows the latest belief classification and aggregate action accounting", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-schema-quality-repl-"));
    roots.push(root);
    await recordSchemaQualityScorecard(root, scorecard("older-exact", "exact", "2026-07-17T06:00:00.000Z"));
    await recordSchemaQualityScorecard(root, scorecard("newer-partial", "partial", "2026-07-17T07:00:00.000Z"));
    const context = { dataDir: root } as ReplCtx;
    expect((await schemaQuality("", context)).output).toContain("Schema quality: partial · not certified");
    const summary = (await schemaQuality("summary", context)).output;
    expect(summary).toContain("2 run(s) · 1 certified");
    expect(summary).toContain("1 exact · 1 partial · 0 untested · 0 contradicted");
    expect(summary).toContain("Real actions: 2/2 verified · simulated calls: 6");
  });
});
