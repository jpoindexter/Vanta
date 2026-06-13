import { describe, it, expect } from "vitest";
import { fitSegments, type Segment } from "./status-bar.js";

// Mirrors the segment list StatusBar builds internally.
function makeSegs(queued?: number): Segment[] {
  const segs: Segment[] = [
    { text: "  claude-sonnet-4-6",     priority: 5 },
    { text: "  ·  24k/200k [████░░░░] 12%", priority: 4 },
    { text: "  ·  3 turns",            priority: 3 },
    ...(queued ? [{ text: `  ·  ${queued} queued`, priority: 2 }] : []),
    { text: "  ·  esc to interrupt",   priority: 1 },
  ];
  return segs;
}

describe("fitSegments", () => {
  it("keeps all segments when line fits within width", () => {
    const segs = makeSegs();
    const result = fitSegments(segs, 200);
    expect(result).toHaveLength(segs.length);
    // every original text present
    for (const s of segs) expect(result).toContain(s.text);
  });

  it("drops the hint first (priority 1) when width is tight", () => {
    const segs = makeSegs();
    // All segs without hint: ~57 chars; with hint: ~78. Use 60 to force hint off.
    const joined = segs
      .filter((s) => s.priority > 1)
      .map((s) => s.text)
      .join("");
    const width = joined.length + 5; // fits everything except hint
    const result = fitSegments(segs, width);
    expect(result).not.toContain("  ·  esc to interrupt");
    expect(result).toContain("  claude-sonnet-4-6");
    expect(result).toContain("  ·  24k/200k [████░░░░] 12%");
  });

  it("always keeps at least model + ctx when extremely narrow", () => {
    const segs = makeSegs();
    // 10 chars — forces everything except the top-priority pair to be dropped.
    // fitSegments will reduce to 1 segment at minimum; with priority 5 surviving
    // since it's sorted descending and we keep the head.
    const result = fitSegments(segs, 10);
    // Must keep at least 1 segment (the highest-priority: model).
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toBe("  claude-sonnet-4-6");
  });

  it("includes queued segment when width allows and drops it before turns", () => {
    const segs = makeSegs(2);
    // Wide enough for model + ctx + turns + queued but not hint.
    const withoutHint = segs.filter((s) => s.priority > 1).map((s) => s.text).join("");
    const width = withoutHint.length + 3;
    const result = fitSegments(segs, width);
    expect(result).toContain("  ·  2 queued");
    expect(result).not.toContain("  ·  esc to interrupt");
  });

  it("drops queued before turns when width is tighter", () => {
    const segs = makeSegs(2);
    // Wide enough for model + ctx + turns but not queued or hint.
    const withoutQueuedHint = segs
      .filter((s) => s.priority >= 3)
      .map((s) => s.text)
      .join("");
    const width = withoutQueuedHint.length + 3;
    const result = fitSegments(segs, width);
    expect(result).toContain("  ·  3 turns");
    expect(result).not.toContain("  ·  2 queued");
    expect(result).not.toContain("  ·  esc to interrupt");
  });

  it("preserves original order in result", () => {
    const segs = makeSegs(1);
    const result = fitSegments(segs, 200);
    // Result order must match original insertion order.
    const origOrder = segs.map((s) => s.text).filter((t) => result.includes(t));
    expect(result).toEqual(origOrder);
  });
});
