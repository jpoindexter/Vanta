import { describe, it, expect } from "vitest";
import {
  fireWindowKey,
  shouldFire,
  markFired,
  type LastFired,
} from "./at-most-once.js";

describe("fireWindowKey", () => {
  it("produces a minute-resolution local key", () => {
    // Constructed via local-field args so the assertion is timezone-independent.
    const d = new Date(2026, 5, 1, 8, 7, 42, 500); // 2026-06-01 08:07:42.500 local
    expect(fireWindowKey(d)).toBe("2026-06-01T08:07");
  });

  it("is identical for two moments in the same minute", () => {
    const a = new Date(2026, 5, 1, 8, 7, 0, 0);
    const b = new Date(2026, 5, 1, 8, 7, 59, 999);
    expect(fireWindowKey(a)).toBe(fireWindowKey(b));
  });

  it("differs across minute boundaries", () => {
    const a = new Date(2026, 5, 1, 8, 7, 59, 999);
    const b = new Date(2026, 5, 1, 8, 8, 0, 0);
    expect(fireWindowKey(a)).not.toBe(fireWindowKey(b));
  });

  it("zero-pads month, day, hour, and minute", () => {
    const d = new Date(2026, 0, 3, 4, 5, 0, 0); // Jan 3 04:05
    expect(fireWindowKey(d)).toBe("2026-01-03T04:05");
  });
});

describe("shouldFire", () => {
  const KEY = "2026-06-01T08:07";

  it("fires when the task has never fired", () => {
    expect(shouldFire(1, KEY, {})).toBe(true);
  });

  it("does NOT re-fire for the same window it already fired", () => {
    const lastFired: LastFired = { "1": KEY };
    expect(shouldFire(1, KEY, lastFired)).toBe(false);
  });

  it("fires for a genuinely-new window even after firing a prior one", () => {
    const lastFired: LastFired = { "1": KEY };
    expect(shouldFire(1, "2026-06-01T08:08", lastFired)).toBe(true);
  });

  it("treats tasks independently — one firing does not block another", () => {
    const lastFired: LastFired = { "1": KEY };
    expect(shouldFire(2, KEY, lastFired)).toBe(true);
  });

  it("accepts a numeric task id (matches the stringified stored key)", () => {
    const lastFired = markFired({}, 7, KEY);
    expect(shouldFire(7, KEY, lastFired)).toBe(false);
    expect(shouldFire("7", KEY, lastFired)).toBe(false);
  });
});

describe("markFired", () => {
  const KEY = "2026-06-01T08:07";

  it("records the task's window key", () => {
    expect(markFired({}, 1, KEY)).toEqual({ "1": KEY });
  });

  it("does NOT mutate the input map (returns a new map)", () => {
    const before: LastFired = { "1": "2026-06-01T08:06" };
    const after = markFired(before, 1, KEY);
    expect(before).toEqual({ "1": "2026-06-01T08:06" });
    expect(after).toEqual({ "1": KEY });
    expect(after).not.toBe(before);
  });

  it("preserves other tasks' keys", () => {
    const before: LastFired = { "2": "2026-06-01T08:06" };
    expect(markFired(before, 1, KEY)).toEqual({
      "2": "2026-06-01T08:06",
      "1": KEY,
    });
  });

  it("round-trips through shouldFire — a marked task is skipped, the next window fires", () => {
    let lf: LastFired = {};
    expect(shouldFire(1, KEY, lf)).toBe(true);
    lf = markFired(lf, 1, KEY);
    // Same window re-tick: skipped.
    expect(shouldFire(1, KEY, lf)).toBe(false);
    // Next window: fires.
    const next = "2026-06-01T08:08";
    expect(shouldFire(1, next, lf)).toBe(true);
    lf = markFired(lf, 1, next);
    expect(shouldFire(1, next, lf)).toBe(false);
  });
});
