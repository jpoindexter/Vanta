import { describe, expect, it } from "vitest";
import {
  captureShipRatio,
  topUnfinished,
  velocityClosureWarning,
} from "./closure.js";
import type { VelocityEvent } from "./store.js";

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-06-01T00:00:00Z").getTime();

/** Build an event `daysAgo` days before BASE (larger daysAgo = older). */
function ev(type: VelocityEvent["type"], itemId: string, daysAgo: number): VelocityEvent {
  return { type, itemId, at: new Date(BASE - daysAgo * DAY).toISOString() };
}

describe("captureShipRatio", () => {
  it("computes captures/max(1,ships)", () => {
    const events = [ev("capture", "a", 3), ev("capture", "b", 2), ev("ship", "a", 1)];
    expect(captureShipRatio(events)).toEqual({ captures: 2, ships: 1, ratio: 2 });
  });

  it("never divides by zero — zero ships reports raw capture count", () => {
    const events = [ev("capture", "a", 1), ev("capture", "b", 1)];
    expect(captureShipRatio(events)).toEqual({ captures: 2, ships: 0, ratio: 2 });
  });

  it("is zero on empty input", () => {
    expect(captureShipRatio([])).toEqual({ captures: 0, ships: 0, ratio: 0 });
  });
});

describe("topUnfinished", () => {
  it("excludes captures with a later ship", () => {
    // 'a' captured then shipped → finished; 'b' captured, never shipped.
    const events = [ev("capture", "a", 3), ev("ship", "a", 2), ev("capture", "b", 1)];
    expect(topUnfinished(events)).toEqual(["b"]);
  });

  it("orders newest-captured first and caps to n", () => {
    const events = [
      ev("capture", "old", 5),
      ev("capture", "mid", 3),
      ev("capture", "new", 1),
    ];
    expect(topUnfinished(events, 2)).toEqual(["new", "mid"]);
  });

  it("treats a ship BEFORE a re-capture as still unfinished", () => {
    // shipped, then captured again later → outstanding again.
    const events = [ev("capture", "a", 5), ev("ship", "a", 4), ev("capture", "a", 1)];
    expect(topUnfinished(events)).toEqual(["a"]);
  });

  it("dedupes repeated unfinished captures of the same id", () => {
    // Append-ordered (chronological): b captured, then a captured twice.
    const events = [ev("capture", "b", 3), ev("capture", "a", 2), ev("capture", "a", 1)];
    expect(topUnfinished(events)).toEqual(["a", "b"]);
  });
});

describe("velocityClosureWarning", () => {
  // 6 captures, 1 ship → ratio 6 > 5.
  const overThreshold: VelocityEvent[] = [
    ...Array.from({ length: 6 }, (_, i) => ev("capture", `c${i}`, 6 - i)),
    ev("ship", "c0", 0),
  ];

  it("fires only when ratio exceeds threshold and lists unfinished items", () => {
    const out = velocityClosureWarning(overThreshold);
    expect(out).toContain("6.0:1");
    expect(out).toContain("top unfinished:");
    // c0 shipped → excluded; newest unfinished first.
    expect(out).toContain("· c5");
    expect(out).not.toContain("· c0");
  });

  it("respects a custom top-N count", () => {
    const out = velocityClosureWarning(overThreshold, { n: 1 });
    const bullets = out.split("\n").filter((l) => l.trim().startsWith("·"));
    expect(bullets).toHaveLength(1);
  });

  it("returns empty string at exactly the threshold", () => {
    // 5 captures, 1 ship → ratio 5, not > 5.
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev("capture", `c${i}`, 5 - i)),
      ev("ship", "c0", 0),
    ];
    expect(velocityClosureWarning(events)).toBe("");
  });

  it("returns empty string under the threshold", () => {
    const events = [ev("capture", "a", 2), ev("ship", "b", 1)];
    expect(velocityClosureWarning(events)).toBe("");
  });

  it("honors a custom threshold", () => {
    // ratio 2 — over a threshold of 1, under the default 5.
    const events = [ev("capture", "a", 2), ev("capture", "b", 1), ev("ship", "a", 0)];
    expect(velocityClosureWarning(events)).toBe("");
    expect(velocityClosureWarning(events, { threshold: 1 })).toContain("2.0:1");
  });
});
