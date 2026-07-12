import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTickets } from "../tickets/store.js";
import {
  classifyWork,
  formatMaintenanceBudget,
  listWorkTurns,
  recordWorkOutcome,
  summarizeMaintenanceBudget,
} from "./budget.js";

describe("maintenance budget", () => {
  it("defaults to delivery and accepts explicit maintenance evidence or override", () => {
    expect(classifyWork("Build the customer onboarding flow")).toEqual({ workClass: "delivery", reason: "default" });
    expect(classifyWork("Audit and update AGENTS.md documentation").workClass).toBe("maintenance");
    expect(classifyWork("Build a feature", { VANTA_WORK_CLASS: "maintenance" }).reason).toBe("environment override");
  });

  it("reads the durable ledger tolerantly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-maint-budget-"));
    await recordWorkOutcome(dir, {
      instruction: "Build the export",
      sessionId: "s1",
      elapsedMs: 100,
      usage: { inputTokens: 20, outputTokens: 10 },
      toolIterations: 2,
      stoppedReason: "done",
    });
    await appendFile(join(dir, "work-ledger.jsonl"), "{bad}\n", "utf8");
    expect(await listWorkTurns(dir)).toHaveLength(1);
  });

  it("reports maintenance versus delivery by time and tokens", () => {
    const rows = [
      { version: 1 as const, ts: "2026-07-12T00:00:00Z", sessionId: "a", workClass: "maintenance" as const, reason: "fixture", elapsedMs: 700, inputTokens: 70, outputTokens: 30, toolIterations: 1, stoppedReason: "done" },
      { version: 1 as const, ts: "2026-07-12T00:00:01Z", sessionId: "b", workClass: "delivery" as const, reason: "fixture", elapsedMs: 300, inputTokens: 20, outputTokens: 10, toolIterations: 1, stoppedReason: "done" },
    ];
    const report = summarizeMaintenanceBudget(rows, { threshold: 0.6, minTurns: 2 });
    expect(report.maintenanceTimeRatio).toBe(0.7);
    expect(report.maintenanceTokenRatio).toBeCloseTo(100 / 130);
    expect(report.dominating).toBe(true);
    expect(formatMaintenanceBudget(report)).toContain("ALERT");
  });

  it("creates one actionable warning ticket when a meaningful sample crosses the threshold", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-maint-budget-"));
    for (let i = 0; i < 6; i++) {
      await recordWorkOutcome(dir, {
        instruction: "Update the harness documentation",
        sessionId: `m${i}`,
        elapsedMs: 100,
        usage: { inputTokens: 10, outputTokens: 10 },
        toolIterations: 1,
        stoppedReason: "done",
      }, { threshold: 0.6, minTurns: 5 });
    }
    const tickets = await listTickets(dir);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.labels).toContain("needs-human:maintenance_budget");
    expect(tickets[0]?.comments).toHaveLength(1);
  });
});
