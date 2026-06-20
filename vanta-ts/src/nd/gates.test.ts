import { describe, it, expect } from "vitest";
import { applySensoryLoad, applyTimeSupport, GATES } from "./gates.js";
import { emptyEfState } from "./engine.js";
import type { EfSignals } from "./types.js";

const sig = (over: Partial<EfSignals> = {}): EfSignals => ({
  turnIndex: 1, lastUserMessage: "", toolNames: [], producedText: true,
  wroteFiles: false, committed: false, activeGoalText: null, elapsedMin: 0,
  captures: 0, ships: 0, ...over,
});

/** The real time-blindness nudge string the gate produces at threshold. */
function timeNudge(elapsedMin: number): string {
  const gate = GATES.find((g) => g.id === "time-blindness")!;
  const { nudge } = gate.evaluate(sig({ elapsedMin }), emptyEfState()["time-blindness"], 45);
  return nudge ?? "";
}

describe("applySensoryLoad", () => {
  it("medium (DEFAULT) leaves the decorated nudge unchanged", () => {
    const nudge = "🔎 8 turns of reading/analysis without building anything.";
    expect(applySensoryLoad(nudge, "medium")).toBe(nudge);
  });

  it("high keeps full decoration unchanged", () => {
    const nudge = "🌀 12 turns deep in `grep`.";
    expect(applySensoryLoad(nudge, "high")).toBe(nudge);
  });

  it("low strips a leading emoji glyph", () => {
    expect(applySensoryLoad("🔎 8 turns of reading.", "low")).toBe("8 turns of reading.");
  });

  it("low strips a leading non-emoji symbol glyph (▶/↺)", () => {
    expect(applySensoryLoad("▶ Starting is the hard part.", "low")).toBe("Starting is the hard part.");
    expect(applySensoryLoad("↺ `grep` 3 turns running.", "low")).toBe("`grep` 3 turns running.");
  });
});

describe("applyTimeSupport", () => {
  it("ranges (DEFAULT) leaves the time nudge unchanged", () => {
    const nudge = timeNudge(50);
    expect(applyTimeSupport(nudge, "ranges")).toBe(nudge);
  });

  it("points drops the soft checkpoint-or-break range tail", () => {
    const nudge = timeNudge(50);
    const out = applyTimeSupport(nudge, "points");
    expect(out).toContain("50 min on this session.");
    expect(out).not.toContain("Worth a checkpoint or a break?");
  });

  it("off suppresses the time nudge entirely", () => {
    expect(applyTimeSupport(timeNudge(50), "off")).toBe("");
  });

  it("passes a non-time nudge through untouched for every style", () => {
    const other = "🔎 8 turns of reading/analysis without building anything.";
    for (const style of ["ranges", "points", "off"] as const) {
      expect(applyTimeSupport(other, style)).toBe(other);
    }
  });
});
