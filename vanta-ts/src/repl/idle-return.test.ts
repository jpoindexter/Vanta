import { describe, it, expect } from "vitest";
import {
  isIdleReturn,
  idleDurationLabel,
  buildIdleReturn,
  resolveIdleThresholdMs,
  idleReturnEnabled,
  DEFAULT_IDLE_RETURN_MS,
  type IdleReturnInput,
} from "./idle-return.js";

describe("isIdleReturn", () => {
  it("is true when the gap is at least the default threshold (30+ min idle)", () => {
    // Arrange
    const lastActiveMs = 0;
    const nowMs = DEFAULT_IDLE_RETURN_MS; // exactly 30 min
    // Act / Assert
    expect(isIdleReturn(lastActiveMs, nowMs)).toBe(true);
  });

  it("is true for a long gap well past the threshold (hours away)", () => {
    expect(isIdleReturn(0, 3 * 60 * 60_000)).toBe(true);
  });

  it("is false under the threshold (a short pause is not a long idle gap)", () => {
    // Arrange — 29m59s gap, just under 30 min.
    const gap = DEFAULT_IDLE_RETURN_MS - 1_000;
    // Act / Assert
    expect(isIdleReturn(0, gap)).toBe(false);
  });

  it("is false when the away-summary 5-min window has passed but idle has not", () => {
    // Idle-return is a BIGGER gap than away-summary: a 10-min gap is 'away' but
    // not yet an idle-return.
    expect(isIdleReturn(0, 10 * 60_000)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(isIdleReturn(0, 60_000, 60_000)).toBe(true);
    expect(isIdleReturn(0, 59_000, 60_000)).toBe(false);
  });

  it("is disabled (never idle) at a threshold of 0", () => {
    expect(isIdleReturn(0, 999_999_999, 0)).toBe(false);
  });
});

describe("resolveIdleThresholdMs", () => {
  it("defaults to 30 minutes when unset", () => {
    expect(resolveIdleThresholdMs({})).toBe(DEFAULT_IDLE_RETURN_MS);
  });

  it("reads a numeric override from VANTA_IDLE_RETURN_MS", () => {
    expect(resolveIdleThresholdMs({ VANTA_IDLE_RETURN_MS: "60000" })).toBe(60_000);
  });

  it("treats 0 as the disable sentinel (passes through)", () => {
    expect(resolveIdleThresholdMs({ VANTA_IDLE_RETURN_MS: "0" })).toBe(0);
  });

  it("falls back to the default on a blank, non-numeric, or negative value", () => {
    expect(resolveIdleThresholdMs({ VANTA_IDLE_RETURN_MS: "   " })).toBe(DEFAULT_IDLE_RETURN_MS);
    expect(resolveIdleThresholdMs({ VANTA_IDLE_RETURN_MS: "abc" })).toBe(DEFAULT_IDLE_RETURN_MS);
    expect(resolveIdleThresholdMs({ VANTA_IDLE_RETURN_MS: "-5" })).toBe(DEFAULT_IDLE_RETURN_MS);
  });
});

describe("idleReturnEnabled", () => {
  it("is on by default (unset env)", () => {
    expect(idleReturnEnabled({})).toBe(true);
  });

  it("is off only for the explicit '0' disable flag", () => {
    expect(idleReturnEnabled({ VANTA_IDLE_RETURN: "0" })).toBe(false);
  });

  it("any other value keeps it on", () => {
    expect(idleReturnEnabled({ VANTA_IDLE_RETURN: "1" })).toBe(true);
    expect(idleReturnEnabled({ VANTA_IDLE_RETURN: "true" })).toBe(true);
  });
});

describe("idleDurationLabel", () => {
  it("renders sub-hour gaps in whole minutes", () => {
    expect(idleDurationLabel(31 * 60_000)).toBe("31m");
  });

  it("renders multi-hour gaps as 'Nh Mm'", () => {
    expect(idleDurationLabel(63 * 60_000)).toBe("1h 3m");
  });

  it("drops the trailing 0m on a whole-hour gap", () => {
    expect(idleDurationLabel(2 * 60 * 60_000)).toBe("2h");
  });

  it("clamps a negative gap to 0s", () => {
    expect(idleDurationLabel(-5_000)).toBe("0s");
  });
});

describe("buildIdleReturn", () => {
  const overThreshold = DEFAULT_IDLE_RETURN_MS + 60_000; // 31 min

  it("returns null under the threshold (current behavior — nothing)", () => {
    // Arrange — 10 min idle, below the 30-min threshold.
    const input: IdleReturnInput = { idleMs: 10 * 60_000, activeGoal: "ship the gate" };
    // Act / Assert
    expect(buildIdleReturn(input)).toBeNull();
  });

  it("offers resume when idle past threshold with an active goal", () => {
    // Act
    const block = buildIdleReturn({ idleMs: overThreshold, activeGoal: "ship the gate" });
    // Assert
    expect(block).not.toBeNull();
    expect(block).toContain("Back after 31m");
    expect(block).toContain("1) Resume: ship the gate");
    expect(block).toContain("Start fresh");
  });

  it("offers a review option when there are in-progress items", () => {
    const block = buildIdleReturn({ idleMs: overThreshold, inProgressItems: 3 });
    expect(block).toContain("1) Review 3 in-progress items");
    expect(block).toContain("2) Start fresh");
  });

  it("singularizes a single in-progress item", () => {
    const block = buildIdleReturn({ idleMs: overThreshold, inProgressItems: 1 });
    expect(block).toContain("Review 1 in-progress item");
    expect(block).not.toContain("items");
  });

  it("numbers all three options when goal AND items both apply", () => {
    const block = buildIdleReturn({
      idleMs: overThreshold,
      activeGoal: "ship the gate",
      inProgressItems: 2,
    });
    expect(block).toContain("1) Resume: ship the gate");
    expect(block).toContain("2) Review 2 in-progress items");
    expect(block).toContain("3) Start fresh");
  });

  it("still offers start-fresh when idle but nothing else to offer (documented choice)", () => {
    // No goal, no items — a returning operator is still acknowledged, never
    // dropped cold. The block is NOT null; it offers exactly start-fresh.
    const block = buildIdleReturn({ idleMs: overThreshold });
    expect(block).not.toBeNull();
    expect(block).toContain("1) Start fresh");
    expect(block).not.toContain("Resume:");
    expect(block).not.toContain("Review");
  });

  it("ignores an empty / whitespace-only goal (no resume option)", () => {
    const block = buildIdleReturn({ idleMs: overThreshold, activeGoal: "   " });
    expect(block).not.toContain("Resume:");
    expect(block).toContain("1) Start fresh");
  });

  it("control-strips the goal text (no escape injection)", () => {
    // Build dirty input purely from escape sequences (no raw control bytes in
    // the source): ESC + BEL + tab + newline. Each becomes a space, then
    // whitespace runs collapse, so no control byte reaches the rendered block.
    const esc = String.fromCharCode(0x1b);
    const bel = String.fromCharCode(0x07);
    const dirtyGoal = `ship${esc}${bel} the\tgate\n`;
    const block = buildIdleReturn({ idleMs: overThreshold, activeGoal: dirtyGoal });
    expect(block).toContain("Resume: ship the gate");
    expect(block).not.toContain(esc);
    expect(block).not.toContain(bel);
    expect(block).not.toContain("\n");
    expect(block).not.toContain("\t");
  });

  it("returns null on invalid input (errors-as-values, never throws)", () => {
    // idleMs is required and must be a number.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(buildIdleReturn({} as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(buildIdleReturn({ idleMs: "nope" } as any)).toBeNull();
  });

  it("honors a custom threshold (disabled at 0 → null even when idle)", () => {
    expect(buildIdleReturn({ idleMs: 999_999_999, activeGoal: "x" }, 0)).toBeNull();
  });
});
