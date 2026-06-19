import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetTool } from "./budget.js";
import type { ToolContext } from "./types.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "vanta-budget-tool-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function ctx(): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => true) };
}

describe("budget tool", () => {
  it("sets a limit then reports status", async () => {
    const set = await budgetTool.execute({ action: "set", scope: "loop:x", limit_usd: 5 }, ctx());
    expect(set.ok).toBe(true);
    expect(set.output).toContain("loop:x");
    const status = await budgetTool.execute({ action: "status", scope: "loop:x" }, ctx());
    expect(status.output).toContain("$0.00 / $5.00");
  });

  it("status with no scope lists all (or says none)", async () => {
    expect((await budgetTool.execute({ action: "status" }, ctx())).output).toBe("no budgets set");
  });

  it("clears a budget", async () => {
    await budgetTool.execute({ action: "set", scope: "s", limit_usd: 2 }, ctx());
    const cleared = await budgetTool.execute({ action: "clear", scope: "s" }, ctx());
    expect(cleared.output).toContain("cleared");
  });

  it("rejects set without a limit", async () => {
    const r = await budgetTool.execute({ action: "set", scope: "s" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/limit_usd/);
  });

  it("rejects invalid args", async () => {
    const r = await budgetTool.execute({ action: "bogus" }, ctx());
    expect(r.ok).toBe(false);
  });

  it("describeForSafety names the action (kernel routes it)", () => {
    expect(budgetTool.describeForSafety?.({ action: "set" })).toContain("budget");
  });
});
