import { describe, it, expect } from "vitest";
import { buildUsageView, topTools, type UsageData } from "./usage-view.js";
import type { SessionCost } from "../pricing.js";

const cost: SessionCost = { localUsd: 0, frontierUsd: 0.42, localTurns: 2, frontierTurns: 3, totalTokensSaved: 0 };

function makeData(overrides: Partial<UsageData> = {}): UsageData {
  return { turns: 3, toolCounts: {}, durationMs: 0, ...overrides };
}

describe("topTools", () => {
  it("ranks tools by count descending", () => {
    const top = topTools({ read_file: 2, write_file: 5, shell_cmd: 3 });
    expect(top).toEqual([
      ["write_file", 5],
      ["shell_cmd", 3],
      ["read_file", 2],
    ]);
  });

  it("breaks ties alphabetically so ordering is deterministic", () => {
    const top = topTools({ beta: 1, alpha: 1, gamma: 1 });
    expect(top.map(([name]) => name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("caps to the requested N", () => {
    const top = topTools({ a: 4, b: 3, c: 2, d: 1 }, 2);
    expect(top).toEqual([
      ["a", 4],
      ["b", 3],
    ]);
  });

  it("defaults to the top 5", () => {
    const counts = { a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 };
    expect(topTools(counts)).toHaveLength(5);
  });

  it("returns empty for empty input or a non-positive cap", () => {
    expect(topTools({})).toEqual([]);
    expect(topTools({ a: 1 }, 0)).toEqual([]);
    expect(topTools({ a: 1 }, -3)).toEqual([]);
  });
});

describe("buildUsageView — sections present with their content", () => {
  it("shows the Cost section (via the reused cost formatter) when a session cost is present", () => {
    const out = buildUsageView(makeData({ sessionCost: cost }));
    expect(out).toContain("  Cost");
    // reuses formatSessionCost — frontier $0.42 across 3 turns, local free across 2
    expect(out).toContain("frontier $0.42");
    expect(out).toContain("local free");
  });

  it("omits the Cost section when no session cost has accrued", () => {
    const out = buildUsageView(makeData({ toolCounts: { read_file: 1 } }));
    expect(out).not.toContain("Cost");
    expect(out).not.toContain("frontier");
  });

  it("shows the Session section with turn count and a compact duration", () => {
    const out = buildUsageView(makeData({ turns: 3, durationMs: 90_000 }));
    expect(out).toContain("  Session");
    expect(out).toContain("3 turns");
    expect(out).toContain("1m 30s");
  });

  it("singularizes a single turn", () => {
    const out = buildUsageView(makeData({ turns: 1, durationMs: 5_000 }));
    expect(out).toContain("1 turn ·");
    expect(out).not.toContain("1 turns");
  });

  it("formats hours+minutes for long sessions", () => {
    const out = buildUsageView(makeData({ durationMs: 3_725_000 }));
    expect(out).toContain("1h 2m");
  });

  it("shows the Tools section ranked by count desc when tools ran", () => {
    const out = buildUsageView(makeData({ toolCounts: { read_file: 2, write_file: 5 } }));
    expect(out).toContain("  Tools");
    expect(out).toContain("write_file ×5");
    expect(out).toContain("read_file ×2");
    expect(out.indexOf("write_file")).toBeLessThan(out.indexOf("read_file"));
  });

  it("shows a placeholder in the Tools section when no tools ran", () => {
    const out = buildUsageView(makeData({ turns: 2 }));
    expect(out).toContain("  Tools");
    expect(out).toContain("(no tools used yet)");
  });

  it("shows the Activity sparkline (reused labeledSparkline) when a series is present", () => {
    const out = buildUsageView(makeData({ activitySeries: [1, 4, 2, 8] }));
    expect(out).toContain("  Activity");
    // labeledSparkline format: `activity │…│ max=N`
    expect(out).toContain("activity │");
    expect(out).toContain("max=8");
  });

  it("omits the Activity section when no series is present", () => {
    const out = buildUsageView(makeData({ turns: 1, durationMs: 1000 }));
    expect(out).not.toContain("Activity");
  });

  it("renders all four sections together in order", () => {
    const out = buildUsageView(
      makeData({ sessionCost: cost, turns: 4, durationMs: 60_000, toolCounts: { read_file: 3 }, activitySeries: [1, 2, 3] }),
    );
    const order = ["Cost", "Session", "Tools", "Activity"].map((s) => out.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });
});

describe("buildUsageView — empty/zero data", () => {
  it("returns the minimal no-usage view when nothing has happened", () => {
    const out = buildUsageView(makeData({ turns: 0, durationMs: 0 }));
    expect(out).toBe("  (no usage yet)");
  });

  it("treats a zero-turn session cost as empty", () => {
    const empty: SessionCost = { localUsd: 0, frontierUsd: 0, localTurns: 0, frontierTurns: 0, totalTokensSaved: 0 };
    expect(buildUsageView(makeData({ turns: 0, durationMs: 0, sessionCost: empty }))).toBe("  (no usage yet)");
  });

  it("is non-empty as soon as any axis has data (e.g. just duration)", () => {
    const out = buildUsageView(makeData({ turns: 0, durationMs: 1000 }));
    expect(out).not.toBe("  (no usage yet)");
    expect(out).toContain("Session");
  });
});
