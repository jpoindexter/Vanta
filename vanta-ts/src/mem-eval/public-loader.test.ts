import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLoCoMo, loadLongMemEval } from "./public-loader.js";

function tempFile(name: string, value: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "public-mem-"));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value), "utf8");
  return { dir, path };
}

describe("public memory dataset loaders", () => {
  it("maps LongMemEval session evidence into deterministic recall cases", () => {
    const { dir, path } = tempFile("long.json", [{
      question_id: "q1",
      question_type: "knowledge-update",
      question: "Where does Dana work now?",
      haystack_session_ids: ["s1", "s2"],
      haystack_dates: ["2024-01-01", "2024-02-01"],
      haystack_sessions: [[{ role: "user", content: "Dana worked at Northwind." }], [{ role: "user", content: "Dana joined Contoso." }]],
      answer_session_ids: ["s2"],
    }]);
    try {
      const loaded = loadLongMemEval(path);
      expect(loaded.skipped).toHaveLength(0);
      expect(loaded.cases[0]?.question.gold).toEqual(["q1:session:s2"]);
      expect(loaded.cases[0]?.question.category).toBe("knowledge-update");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps LoCoMo dialog evidence into deterministic recall cases", () => {
    const { dir, path } = tempFile("locomo.json", [{
      sample_id: "sample",
      conversation: {
        session_1_date_time: "2024-03-04 12:00",
        session_1: [{ speaker: "A", dia_id: "d1", text: "I adopted a cat named Miso." }],
      },
      qa: [{ question: "What pet was adopted?", category: "single-hop", evidence: ["d1"] }],
    }]);
    try {
      const loaded = loadLoCoMo(path);
      expect(loaded.skipped).toHaveLength(0);
      expect(loaded.cases[0]?.records[0]?.id).toBe("sample:dialog:d1");
      expect(loaded.cases[0]?.question.gold).toEqual(["sample:dialog:d1"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts LoCoMo numeric categories from the released file", () => {
    const { dir, path } = tempFile("locomo.json", [{
      sample_id: "sample",
      conversation: {
        session_1_date_time: "2024-03-04 12:00",
        session_1: [{ speaker: "A", dia_id: "D1:3", text: "I went to a support group yesterday." }],
      },
      qa: [{ question: "When was the support group?", category: 2, evidence: ["D1:3"] }],
    }]);
    try {
      const loaded = loadLoCoMo(path);
      expect(loaded.cases[0]?.question.category).toBe("temporal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
