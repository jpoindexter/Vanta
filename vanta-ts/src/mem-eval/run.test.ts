import { describe, it, expect } from "vitest";
import { runMemEval } from "./run.js";
import type { MemEvalReport } from "./types.js";

const NOW = Date.parse("2024-07-01");

/** Deterministic offline embedder: 26-dim lowercase letter-frequency vector. */
function fakeEmbed(text: string): Promise<number[] | null> {
  const v = new Array(26).fill(0);
  for (const ch of text.toLowerCase()) {
    const i = ch.charCodeAt(0) - 97;
    if (i >= 0 && i < 26) v[i] += 1;
  }
  return Promise.resolve(v);
}

function cell(r: MemEvalReport, mode: string, noise: string) {
  return r.cells.find((c) => c.mode === mode && c.noise === noise);
}

describe("runMemEval", () => {
  it("scores lexical-only without any embedder", async () => {
    const r = await runMemEval({ modes: ["lexical"], now: NOW });
    expect(r.k).toBe(5);
    expect(r.questions).toBeGreaterThan(0);
    for (const c of r.cells) {
      expect(c.available).toBe(true);
      expect(c.recallAtK).toBeGreaterThanOrEqual(0);
      expect(c.recallAtK).toBeLessThanOrEqual(1);
    }
  });

  it("marks semantic/hybrid unavailable when the embedder returns null", async () => {
    const r = await runMemEval({ now: NOW, embed: () => Promise.resolve(null) });
    expect(cell(r, "semantic", "s5")?.available).toBe(false);
    expect(cell(r, "semantic", "s5")?.recallAtK).toBe(0);
    // hybrid still runs (degrades to lexical) and is available
    expect(cell(r, "hybrid", "s5")?.available).toBe(true);
    expect(cell(r, "lexical", "s5")?.available).toBe(true);
  });

  it("runs semantic and hybrid when an embedder is supplied", async () => {
    const r = await runMemEval({ now: NOW, embed: fakeEmbed });
    expect(cell(r, "semantic", "full")?.available).toBe(true);
    expect(cell(r, "hybrid", "full")?.available).toBe(true);
    expect(r.corpusSizes.full).toBeGreaterThan(r.corpusSizes.s5 ?? 0);
  });

  it("reports a cell for every mode × noise combination", async () => {
    const r = await runMemEval({ modes: ["lexical", "hybrid"], noiseLevels: ["s5", "full"], now: NOW });
    expect(r.cells).toHaveLength(4);
  });

  it("temporal mode improves the temporal category over lexical (MEM-TEMPORAL-EVENTS)", async () => {
    const r = await runMemEval({ modes: ["lexical", "temporal"], noiseLevels: ["full"], now: NOW });
    const lex = cell(r, "lexical", "full")?.byCategory.temporal ?? 0;
    const tmp = cell(r, "temporal", "full")?.byCategory.temporal ?? 0;
    expect(tmp).toBeGreaterThan(lex); // temporal-aware recall lifts the weak category
  });
});
