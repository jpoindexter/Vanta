import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatPublicMemReport, recordPublicMemReport } from "./public-report.js";
import { runPublicMemEval } from "./public-run.js";

const NOW = Date.parse("2026-06-18T00:00:00Z");

function writeJson(dir: string, name: string, value: unknown) {
  writeFileSync(join(dir, name), JSON.stringify(value), "utf8");
}

describe("runPublicMemEval", () => {
  it("scores LongMemEval and LoCoMo with deterministic evidence recall", async () => {
    const dir = mkdtempSync(join(tmpdir(), "public-mem-run-"));
    try {
      writeJson(dir, "longmemeval_oracle.json", [{
        question_id: "q1",
        question_type: "single-session-user",
        question: "Who keeps bees?",
        haystack_session_ids: ["s1"],
        haystack_dates: ["2024-01-01"],
        haystack_sessions: [[{ role: "user", content: "Mara keeps bees behind the library." }]],
        answer_session_ids: ["s1"],
      }]);
      writeJson(dir, "locomo10.json", [{
        sample_id: "l1",
        conversation: { session_1_date_time: "2024-02-02", session_1: [{ speaker: "A", dia_id: "d1", text: "Theo restored an old sailboat." }] },
        qa: [{ question: "Who restored the sailboat?", category: "single-hop", evidence: ["d1"] }],
      }]);
      const report = await runPublicMemEval({ dataDir: dir, modes: ["lexical", "temporal"], now: NOW });
      expect(report.datasets).toHaveLength(2);
      expect(report.datasets[0]?.cells[0]?.recallAtK).toBe(1);
      expect(report.modelGrading.available).toBe(false);
      expect(formatPublicMemReport(report)).toContain("public memory eval");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records the public report under .vanta", async () => {
    const dir = mkdtempSync(join(tmpdir(), "public-mem-record-"));
    try {
      const report = await runPublicMemEval({ dataDir: dir, modes: ["lexical"], now: NOW });
      expect(recordPublicMemReport(dir, report)).toBe(".vanta/mem-eval-public-results.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
