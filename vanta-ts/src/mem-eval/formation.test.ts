import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFormationEval } from "./formation.js";
import { formatFormationReport, recordFormationReport } from "./formation-report.js";

describe("runFormationEval", () => {
  it("compares crystallization, ADD-only, and ADD-only with agent facts", () => {
    const report = runFormationEval({ dataDir: "/tmp/no-public-data", now: new Date("2026-07-09T00:00:00.000Z") });
    expect(report.cells.map((c) => c.strategy)).toEqual(["crystallize", "add_only", "add_only_agent_facts"]);
    expect(report.cells.find((c) => c.strategy === "add_only_agent_facts")?.agentFacts).toBe(1);
    expect(report.decision).toContain("fixture winner");
    expect(report.publicDatasets.every((d) => !d.available)).toBe(true);
  });

  it("agent-confirmed facts improve the agent-action question", () => {
    const report = runFormationEval({ dataDir: "/tmp/no-public-data" });
    const addOnly = report.cells.find((c) => c.strategy === "add_only")!;
    const agentFacts = report.cells.find((c) => c.strategy === "add_only_agent_facts")!;
    expect(addOnly.byCategory["information-extraction"]).toBe(0);
    expect(agentFacts.byCategory["information-extraction"]).toBe(1);
    expect(agentFacts.recallAtK).toBeGreaterThan(addOnly.recallAtK);
  });

  it("records and formats the decision artifact", () => {
    const dir = mkdtempSync(join(tmpdir(), "formation-ab-"));
    try {
      const report = runFormationEval({ dataDir: dir, now: new Date("2026-07-09T00:00:00.000Z") });
      const out = formatFormationReport(report);
      expect(out).toContain("memory formation A/B");
      expect(out).toContain("public data:");
      expect(out).toContain("public benchmark:");
      const rel = recordFormationReport(dir, report);
      expect(JSON.parse(readFileSync(join(dir, rel), "utf8")).decision).toContain("missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scores available public LongMemEval and LoCoMo files", () => {
    const dir = mkdtempSync(join(tmpdir(), "formation-public-"));
    try {
      writeFileSync(join(dir, "longmemeval_oracle.json"), JSON.stringify([{
        question_id: "q1",
        question_type: "single-session-user",
        question: "Who keeps bees?",
        haystack_session_ids: ["s1"],
        haystack_dates: ["2024-01-01"],
        haystack_sessions: [[{ role: "user", content: "Mara keeps bees behind the library." }]],
        answer_session_ids: ["s1"],
      }]));
      writeFileSync(join(dir, "locomo10.json"), JSON.stringify([{
        sample_id: "l1",
        conversation: { session_1_date_time: "2024-02-02", session_1: [{ speaker: "A", dia_id: "d1", text: "Theo restored an old sailboat." }] },
        qa: [{ question: "Who restored the sailboat?", category: "single-hop", evidence: ["d1"] }],
      }]));
      const report = runFormationEval({ dataDir: dir });
      expect(report.publicBenchmarks.map((b) => b.dataset)).toEqual(["longmemeval", "locomo"]);
      expect(report.decision).toContain("fixture+public");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
