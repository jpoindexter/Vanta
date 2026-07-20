import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { GraphV1ProofSummary } from "./release-proof.js";

const run = promisify(execFile);

describe("graph engineering v1 release proof", () => {
  it("proves the complete organization in fresh processes", async () => {
    const { stdout } = await run(process.execPath, ["--import", "tsx", "scripts/graph-engineering-v1-release-proof.ts"], {
      cwd: process.cwd(), timeout: 30_000,
    });
    const summary = JSON.parse(stdout.trim().split("\n").at(-1)!) as GraphV1ProofSummary;
    expect(summary.main).toMatchObject({ status: "succeeded", writes: 2, restarted: true, parallelResearchers: 2, builderAttempts: 2, reviewerAttempts: 3, approval: true, acceptance: true });
    expect(summary.adaptive).toMatchObject({ status: "succeeded", change: "fan-out", changes: 1 });
    expect(summary.failure).toEqual({ status: "exhausted", escalated: true, falseDone: false });
    expect(summary.replay.handoffWritten).toBe(true);
    expect(summary.budget.costUsd).toBeLessThanOrEqual(1);
  });
});
