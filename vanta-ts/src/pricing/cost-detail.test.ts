import { describe, it, expect } from "vitest";
import {
  emptyCostDetail,
  addTurnUsage,
  addLinesChanged,
  addToolMs,
  modelCostUsd,
  formatCostDetail,
  type CostDetail,
} from "./cost-detail.js";
import { estimateCostUsd } from "../pricing.js";

describe("emptyCostDetail", () => {
  it("is a zeroed tracker", () => {
    expect(emptyCostDetail()).toEqual({ byModel: {}, linesChanged: 0, toolMs: 0 });
  });
});

describe("addTurnUsage — per-model accumulation", () => {
  it("sums two turns on the same model", () => {
    const d = addTurnUsage(
      addTurnUsage(emptyCostDetail(), { model: "gpt-4o", inputTokens: 100, outputTokens: 20, cacheTokens: 5, apiMs: 1000 }),
      { model: "gpt-4o", inputTokens: 50, outputTokens: 10, cacheTokens: 5, apiMs: 500 },
    );
    expect(d.byModel["gpt-4o"]).toEqual({
      model: "gpt-4o",
      inputTokens: 150,
      outputTokens: 30,
      cacheTokens: 10,
      apiMs: 1500,
    });
  });

  it("keeps different models separate", () => {
    const d = addTurnUsage(
      addTurnUsage(emptyCostDetail(), { model: "gpt-4o", inputTokens: 100, outputTokens: 20 }),
      { model: "claude-sonnet", inputTokens: 200, outputTokens: 40 },
    );
    expect(Object.keys(d.byModel).sort()).toEqual(["claude-sonnet", "gpt-4o"]);
    expect(d.byModel["gpt-4o"]?.inputTokens).toBe(100);
    expect(d.byModel["claude-sonnet"]?.inputTokens).toBe(200);
  });

  it("defaults cache and api to 0 when absent", () => {
    const d = addTurnUsage(emptyCostDetail(), { model: "gpt-4o", inputTokens: 10, outputTokens: 2 });
    expect(d.byModel["gpt-4o"]?.cacheTokens).toBe(0);
    expect(d.byModel["gpt-4o"]?.apiMs).toBe(0);
  });

  it("never mutates the input detail", () => {
    const before = emptyCostDetail();
    const snapshot: CostDetail = JSON.parse(JSON.stringify(before));
    const after = addTurnUsage(before, { model: "gpt-4o", inputTokens: 10, outputTokens: 2 });
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
    expect(after.byModel).not.toBe(before.byModel);
  });
});

describe("addLinesChanged / addToolMs", () => {
  it("accumulates lines changed immutably", () => {
    const d1 = addLinesChanged(emptyCostDetail(), 10);
    const d2 = addLinesChanged(d1, 5);
    expect(d2.linesChanged).toBe(15);
    expect(d1.linesChanged).toBe(10); // d1 untouched
  });

  it("accumulates tool ms immutably", () => {
    const d1 = addToolMs(emptyCostDetail(), 1200);
    const d2 = addToolMs(d1, 800);
    expect(d2.toolMs).toBe(2000);
    expect(d1.toolMs).toBe(1200);
  });
});

describe("modelCostUsd", () => {
  it("reuses estimateCostUsd for a priced model", () => {
    const usage = { model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 0, cacheTokens: 0, apiMs: 0 };
    expect(modelCostUsd(usage)).toBe(estimateCostUsd("gpt-4o", 1_000_000, 0));
    expect(modelCostUsd(usage)).toBeCloseTo(2.5, 5);
  });

  it("returns null for an unpriced (local) model", () => {
    expect(modelCostUsd({ model: "qwen2.5:14b", inputTokens: 1000, outputTokens: 1000, cacheTokens: 0, apiMs: 0 })).toBeNull();
  });
});

describe("formatCostDetail", () => {
  it("renders the minimal empty view for an empty tracker", () => {
    expect(formatCostDetail(emptyCostDetail())).toBe("  (no usage yet)");
  });

  it("renders a per-model line + a totals line", () => {
    let d = emptyCostDetail();
    d = addTurnUsage(d, { model: "gpt-4o", inputTokens: 12_000, outputTokens: 3000, cacheTokens: 8000, apiMs: 4200 });
    d = addLinesChanged(d, 42);
    d = addToolMs(d, 1500);
    const out = formatCostDetail(d);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    // per-model line: tokens (k-compacted) · api time · cost
    expect(lines[0]).toContain("gpt-4o:");
    expect(lines[0]).toContain("12k in / 3k out / 8k cached");
    expect(lines[0]).toContain("4.2s api");
    // gpt-4o: 12k in @ $2.5/M + 3k out @ $10/M = 0.03 + 0.03 = $0.06
    expect(lines[0]).toContain("$0.06");
    // totals line: tokens + api+tool time + cost + lines
    expect(lines[1]).toContain("total:");
    expect(lines[1]).toContain("4.2s api + 1.5s tool");
    expect(lines[1]).toContain("$0.06");
    expect(lines[1]).toContain("42 lines");
  });

  it("sorts models by input tokens (desc), ties alphabetical", () => {
    let d = emptyCostDetail();
    d = addTurnUsage(d, { model: "gpt-4o", inputTokens: 100, outputTokens: 10 });
    d = addTurnUsage(d, { model: "claude-sonnet", inputTokens: 500, outputTokens: 10 });
    const lines = formatCostDetail(d).split("\n");
    expect(lines[0]).toContain("claude-sonnet:"); // higher input first
    expect(lines[1]).toContain("gpt-4o:");
  });

  it("singularizes one changed line", () => {
    let d = emptyCostDetail();
    d = addTurnUsage(d, { model: "gpt-4o", inputTokens: 10, outputTokens: 2 });
    d = addLinesChanged(d, 1);
    expect(formatCostDetail(d)).toContain("1 line");
    expect(formatCostDetail(d)).not.toContain("1 lines");
  });

  it("shows ~? for an unpriced model and marks the total approximate", () => {
    let d = emptyCostDetail();
    d = addTurnUsage(d, { model: "qwen2.5:14b", inputTokens: 1000, outputTokens: 500 });
    const lines = formatCostDetail(d).split("\n");
    expect(lines[0]).toContain("~?");
    expect(lines[1]).toContain("+~?"); // totals flagged approximate
  });
});
