import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addGoalDependency } from "../goals/deps.js";
import { runGoalsCommand } from "./goals-cmd.js";
import type { Goal } from "../types.js";

describe("runGoalsCommand", () => {
  it("prints goal graph state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goals-cli-"));
    await addGoalDependency(dir, { blockerId: 1, dependentId: 2 });
    const lines: string[] = [];
    const code = await runGoalsCommand("/repo", { dataDir: dir, getGoals: async () => goals(), log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("◌ dependent");
    expect(lines.join("\n")).toContain("blocked_by:1");
  });
});

function goals(): Goal[] {
  return [
    { id: 1, text: "blocker", status: "active" },
    { id: 2, text: "dependent", status: "active" },
  ];
}
