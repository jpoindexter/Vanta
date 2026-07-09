import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_AUTONOMY_CONTRACT,
  decideAutonomy,
  formatAutonomyContract,
  formatAutonomyDecision,
  loadAutonomyContract,
  logAutonomyDecision,
  writeDefaultAutonomyContract,
} from "./contract.js";

describe("autonomy contract", () => {
  it("renders acts-alone, queues, and wakes lanes", () => {
    const out = formatAutonomyContract(DEFAULT_AUTONOMY_CONTRACT);
    expect(out).toContain("Acts alone");
    expect(out).toContain("Queues for approval");
    expect(out).toContain("Wakes me");
  });

  it("decides proactive loop wakes from the acts-alone rule", () => {
    const decision = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, {
      kind: "proactive.loop.advance",
      summary: "advance queued loop",
      risk: "low",
    });
    expect(decision.lane).toBe("acts-alone");
    expect(decision.ruleId).toBe("allow-proactive-loop");
    expect(formatAutonomyDecision(decision)).toContain("advance queued loop");
  });

  it("wakes on high-risk autonomous actions before generic low-risk allow", () => {
    const decision = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, {
      kind: "shell.mutate",
      summary: "delete project files",
      risk: "high",
    });
    expect(decision.lane).toBe("wakes-me");
    expect(decision.ruleId).toBe("wake-high-risk");
  });

  it("writes, loads, and logs a project-local contract decision", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-autonomy-"));
    try {
      await writeDefaultAutonomyContract(dir);
      const contract = await loadAutonomyContract(dir);
      const decision = decideAutonomy(contract, { kind: "status.read", summary: "read status", risk: "low" });
      const log = await logAutonomyDecision(dir, decision, () => new Date("2026-07-09T15:00:00.000Z"));
      expect(await readFile(log, "utf8")).toContain("\"createdAt\":\"2026-07-09T15:00:00.000Z\"");
      expect(await readFile(log, "utf8")).toContain("\"lane\":\"acts-alone\"");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
