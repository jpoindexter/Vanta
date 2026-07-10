import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addGoalDependency } from "../goals/deps.js";
import { runGoalsCommand } from "./goals-cmd.js";
import type { Goal } from "../types.js";

describe("runGoalsCommand", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("prints goal graph state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goals-cli-"));
    dirs.push(dir);
    await addGoalDependency(dir, { blockerId: 1, dependentId: 2 });
    const lines: string[] = [];
    const code = await runGoalsCommand("/repo", { dataDir: dir, getGoals: async () => goals(), log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("◌ dependent");
    expect(lines.join("\n")).toContain("blocked_by:1");
  });

  it("adds, runs, and retires standing goal sentinels", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goals-cli-"));
    dirs.push(dir);
    const lines: string[] = [];
    const log = (line: string): void => { lines.push(line); };

    expect(await runGoalsCommand("/repo", { dataDir: dir, rest: ["sentinel", "add", "4", "keep", "site", "green", "--check", "false"], log })).toBe(0);
    const notify = vi.fn();
    expect(await runGoalsCommand("/repo", { dataDir: dir, rest: ["sentinel", "run"], log, sentinelNotify: notify })).toBe(2);
    expect(lines.join("\n")).toContain("wake goal-4");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "standing_goal_violation" }));
    expect(await runGoalsCommand("/repo", { dataDir: dir, rest: ["sentinel", "retire", "goal-4", "flaky", "check"], log })).toBe(0);
    expect(lines.join("\n")).toContain("retired: flaky check");
  });
});

function goals(): Goal[] {
  return [
    { id: 1, text: "blocker", status: "active" },
    { id: 2, text: "dependent", status: "active" },
  ];
}
