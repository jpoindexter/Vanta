import { describe, it, expect } from "vitest";
import { buildCorpus, noiseCount, NOISE_LEVELS, QUESTIONS } from "./corpus.js";
import { MemoryRecordSchema, MemQuestionSchema } from "./types.js";

describe("corpus fixture", () => {
  it("grows the distractor pool with the noise level", () => {
    const base = buildCorpus("s5").length;
    expect(buildCorpus("s10").length).toBe(base + 5);
    expect(buildCorpus("s20").length).toBe(base + 15);
    expect(buildCorpus("full").length).toBeGreaterThanOrEqual(buildCorpus("s20").length);
  });

  it("includes all gold so every question is answerable at every noise level", () => {
    for (const noise of NOISE_LEVELS) {
      const ids = new Set(buildCorpus(noise).map((r) => r.id));
      for (const q of QUESTIONS) for (const g of q.gold) expect(ids.has(g)).toBe(true);
    }
  });

  it("has a full distractor pool of at least 20 (so s20 vs full differ meaningfully)", () => {
    expect(noiseCount("full")).toBeGreaterThanOrEqual(20);
  });

  it("validates every record and question against the schema", () => {
    for (const r of buildCorpus("full")) expect(MemoryRecordSchema.safeParse(r).success).toBe(true);
    for (const q of QUESTIONS) expect(MemQuestionSchema.safeParse(q).success).toBe(true);
  });

  it("covers all four memory categories", () => {
    const cats = new Set(QUESTIONS.map((q) => q.category));
    expect(cats).toEqual(new Set(["knowledge-update", "multi-session", "preference", "temporal"]));
  });
});
