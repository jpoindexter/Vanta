import { describe, it, expect, vi } from "vitest";
import { runBatchCommand } from "./batch-cmd.js";
import type { FleetReport, FleetTaskSpec } from "../fleet/types.js";
import type { GhRunner } from "../batch/batch.js";

type RunFleetFn = (repoRoot: string, specs: FleetTaskSpec[]) => Promise<FleetReport>;

const report = (): FleetReport => ({
  id: "batch-1", created: "c", updated: "u",
  workers: [
    { id: "w1", taskId: "t1", title: "Add A", status: "done", branch: "b-w1", worktreePath: "/wt/1", updated: "u" },
    { id: "w2", taskId: "t2", title: "Add B", status: "blocked", branch: "b-w2", worktreePath: "/wt/2", updated: "u", blocker: "tests failed" },
  ],
});

describe("runBatchCommand", () => {
  it("runs the fleet then opens a PR per completed worker and reports URLs", async () => {
    const lines: string[] = [];
    const runFleetSpy = vi.fn<RunFleetFn>(async () => report());
    const gh = vi.fn<GhRunner>(async () => ({ ok: true, stdout: "https://github.com/o/r/pull/9", stderr: "" }));
    const push = vi.fn(async () => ({ ok: true, stderr: "" }));
    const code = await runBatchCommand("/repo", ["run", "--task", "Add A", "--task", "Add B"], {
      log: (l) => lines.push(l), runFleet: runFleetSpy, gh, push,
    });
    expect(code).toBe(0);
    expect(runFleetSpy).toHaveBeenCalledOnce();
    // the test gate is appended to each worker instruction
    const specs = runFleetSpy.mock.calls[0]?.[1] ?? [];
    expect(specs[0]?.instruction).toMatch(/run the project's test suite/i);
    // only the done worker gets a PR
    expect(gh).toHaveBeenCalledOnce();
    expect(lines.join("\n")).toMatch(/Add A → https:\/\/github\.com\/o\/r\/pull\/9/);
    expect(lines.join("\n")).toMatch(/Add B \[blocked\]/);
  });

  it("honors --base for the PR target branch", async () => {
    const gh = vi.fn<GhRunner>(async () => ({ ok: true, stdout: "https://x/pull/1", stderr: "" }));
    await runBatchCommand("/repo", ["run", "--base", "develop", "--task", "Add A"], {
      log: () => {}, runFleet: async () => report(), gh, push: async () => ({ ok: true, stderr: "" }),
    });
    expect(gh.mock.calls[0]?.[0]).toContain("develop");
  });

  it("returns 1 with usage when no task is given", async () => {
    const lines: string[] = [];
    const runFleetSpy = vi.fn<RunFleetFn>(async () => report());
    const code = await runBatchCommand("/repo", ["run"], { log: (l) => lines.push(l), runFleet: runFleetSpy });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/Usage: vanta batch/);
    expect(runFleetSpy).not.toHaveBeenCalled();
  });

  it("returns 1 for an unknown subcommand", async () => {
    const code = await runBatchCommand("/repo", ["bogus"], { log: () => {}, runFleet: async () => report() });
    expect(code).toBe(1);
  });
});
