import { describe, expect, it } from "vitest";
import { LoopDefSchema } from "./types.js";

const definition = {
  id: "fixture", goal: "Check defaults", trigger: { kind: "manual" },
  stages: [{ name: "execute", prompt: "Check" }], createdAt: "2026-10-27T00:00:00.000Z",
};

describe("loop schema defaults", () => {
  it("parses the absent stop input so nested defaults remain present", () => {
    const parsed = LoopDefSchema.parse(definition);
    expect(parsed.stop).toEqual({ maxIterations: 10, noProgressWakes: 3, minAcceptRateAfter: 5 });
    expect(parsed.rubric).toEqual({ items: [], passScore: 0.8 });
    expect(parsed.stages[0]?.critiqueDriven).toBe(false);
  });

  it("defaults a partial stop input without discarding its explicit limits", () => {
    const parsed = LoopDefSchema.parse({ ...definition, stop: { maxIterations: 2, maxTokens: 100 } });
    expect(parsed.stop).toEqual({ maxIterations: 2, maxTokens: 100, noProgressWakes: 3, minAcceptRateAfter: 5 });
  });

  it("rejects malformed configured stop rules instead of applying defaults", () => {
    expect(LoopDefSchema.safeParse({ ...definition, stop: { maxIterations: 0 } }).success).toBe(false);
  });
});
