import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSchemaV1ReleaseProof, type SchemaReleaseTaskDriver } from "./release-proof.js";

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function memoryDriver(kind: "repo" | "browser"): SchemaReleaseTaskDriver {
  let value = "pending";
  let calls = 0;
  return {
    kind,
    target: kind === "repo" ? "task.txt" : "#status",
    reset: async () => { value = "pending"; },
    observe: async () => ({ completed: value === "pending" ? 0 : value === "unexpected" ? 2 : 1, value }),
    execute: async (action) => {
      calls += 1;
      value = action.mode === "unexpected" ? "unexpected" : "done";
      return { completed: value === "unexpected" ? 2 : 1, value };
    },
    executionCount: () => calls,
  };
}

describe("Schema v1 release proof", () => {
  it("composes real-task contracts, restart recovery, mismatch containment, and matched eval evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-schema-release-"));
    roots.push(root);
    const result = await runSchemaV1ReleaseProof({
      root,
      repo: memoryDriver("repo"),
      browser: memoryDriver("browser"),
      createdAt: "2026-07-17T14:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.tasks.repo).toMatchObject({ certified: true, planned: true, restored: true, committed: true, replayed: true });
    expect(result.tasks.browser).toMatchObject({ certified: true, planned: true, restored: true, committed: true, replayed: true });
    expect(result.recovery).toMatchObject({ stoppedAfterMismatch: true, remainingActions: 1, recertified: true, resumed: true });
    expect(result.evaluation).toMatchObject({ successNonRegression: true, recoveryActionGain: true, reviewable: true });
    expect(result.tasks.repo.timelineRecords).toBeGreaterThanOrEqual(2);
    expect(result.tasks.browser.timelineRecords).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(readFileSync(result.evidencePath, "utf8"))).toMatchObject({ ok: true, version: 1 });
  }, 30_000);
});
