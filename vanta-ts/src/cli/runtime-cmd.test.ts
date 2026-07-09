import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveFleetReport } from "../fleet/store.js";
import type { FleetReport } from "../fleet/types.js";
import { runRuntimeCommand } from "./runtime-cmd.js";

function fixtureReport(root: string): FleetReport {
  return {
    id: "fleet-preview",
    created: "2026-07-09T00:00:00.000Z",
    updated: "2026-07-09T00:00:00.000Z",
    workers: [{
      id: "worker-a",
      taskId: "task-a",
      title: "Build preview",
      status: "running",
      branch: "fleet/a",
      worktreePath: join(root, "worktree-a"),
      updated: "2026-07-09T00:00:00.000Z",
    }],
  };
}

describe("runtime command", () => {
  it("starts and lists a preview service for a fleet worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-cmd-"));
    const logs: string[] = [];
    try {
      const report = fixtureReport(root);
      mkdirSync(report.workers[0]!.worktreePath, { recursive: true });
      saveFleetReport(root, report);
      const code = await runRuntimeCommand(root, [
        "start",
        "--fleet", "fleet-preview",
        "--worker", "worker-a",
        "--port", "5173",
        "--command", "npm run dev",
      ], {
        log: (line) => logs.push(line),
        spawn: ({ cwd }) => {
          expect(cwd).toBe(join(root, "worktree-a"));
          return { pid: 4242 };
        },
        now: () => new Date("2026-07-09T00:01:00.000Z"),
      });
      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("http://127.0.0.1:5173/");
      expect(logs.join("\n")).toContain("pid 4242");

      const list = await runRuntimeCommand(root, ["list", "--fleet", "fleet-preview"], { log: (line) => logs.push(line) });
      expect(list).toBe(0);
      expect(logs.join("\n")).toContain("worker-a: running · http://127.0.0.1:5173/");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not spawn for an unknown worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-cmd-"));
    let spawned = false;
    try {
      saveFleetReport(root, fixtureReport(root));
      const code = await runRuntimeCommand(root, [
        "start", "--fleet", "fleet-preview", "--worker", "missing", "--port", "5173", "--command", "npm run dev",
      ], { log: () => {}, spawn: () => { spawned = true; return {}; } });
      expect(code).toBe(1);
      expect(spawned).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not record a preview when the worktree is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-cmd-"));
    let spawned = false;
    try {
      saveFleetReport(root, fixtureReport(root));
      const code = await runRuntimeCommand(root, [
        "start", "--fleet", "fleet-preview", "--worker", "worker-a", "--port", "5173", "--command", "npm run dev",
      ], { log: () => {}, spawn: () => { spawned = true; return {}; } });
      expect(code).toBe(1);
      expect(spawned).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
