import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setBudgetLimit, getBudget, recordSpend, clearBudget, listBudgets, budgetsPath, readBudgets } from "./store.js";

const NOW = new Date("2026-06-19T00:00:00.000Z");

describe("budget store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-budget-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("sets and reads a budget limit", async () => {
    const b = await setBudgetLimit(dir, { scope: "loop:x", limitUsd: 5, now: NOW });
    expect(b.limitUsd).toBe(5);
    expect(b.status).toBe("active");
    expect((await getBudget(dir, "loop:x"))?.limitUsd).toBe(5);
  });

  it("updating the limit preserves accumulated spend and recomputes status", async () => {
    await setBudgetLimit(dir, { scope: "s", limitUsd: 10, now: NOW });
    await recordSpend(dir, "s", 6, NOW);
    const lowered = await setBudgetLimit(dir, { scope: "s", limitUsd: 5, now: NOW });
    expect(lowered.spentUsd).toBe(6);
    expect(lowered.status).toBe("exceeded");
  });

  it("recordSpend reports the crossing transition exactly once", async () => {
    await setBudgetLimit(dir, { scope: "s", limitUsd: 10, now: NOW });
    const under = await recordSpend(dir, "s", 4, NOW);
    expect(under?.justExceeded).toBe(false);
    const crossing = await recordSpend(dir, "s", 8, NOW);
    expect(crossing?.justExceeded).toBe(true);
    expect(crossing?.budget.status).toBe("exceeded");
    const after = await recordSpend(dir, "s", 1, NOW);
    expect(after?.justExceeded).toBe(false); // already exceeded — not "just"
  });

  it("recordSpend returns null when no budget is set for the scope", async () => {
    expect(await recordSpend(dir, "unset", 5, NOW)).toBeNull();
  });

  it("clears a budget", async () => {
    await setBudgetLimit(dir, { scope: "s", limitUsd: 5, now: NOW });
    expect(await clearBudget(dir, "s")).toBe(true);
    expect(await getBudget(dir, "s")).toBeNull();
    expect(await clearBudget(dir, "s")).toBe(false);
  });

  it("lists budgets sorted by scope", async () => {
    await setBudgetLimit(dir, { scope: "loop:b", limitUsd: 1, now: NOW });
    await setBudgetLimit(dir, { scope: "loop:a", limitUsd: 2, now: NOW });
    expect((await listBudgets(dir)).map((b) => b.scope)).toEqual(["loop:a", "loop:b"]);
  });

  it("tolerates a corrupt store file", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(budgetsPath(dir), "not json", "utf8");
    expect(await readBudgets(dir)).toEqual({});
  });
});
