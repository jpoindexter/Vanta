import { describe, it, expect } from "vitest";
import { statusFor, applySpend, remainingUsd, isExceeded, newBudget } from "./types.js";

const NOW = new Date("2026-06-19T00:00:00.000Z");

describe("statusFor", () => {
  it("is active below the warn fraction", () => {
    expect(statusFor(0.5, 10, 0.8)).toBe("active");
    expect(statusFor(7.99, 10, 0.8)).toBe("active");
  });
  it("is warning at/above the warn fraction", () => {
    expect(statusFor(8, 10, 0.8)).toBe("warning");
    expect(statusFor(9.99, 10, 0.8)).toBe("warning");
  });
  it("is exceeded at/above the limit", () => {
    expect(statusFor(10, 10, 0.8)).toBe("exceeded");
    expect(statusFor(11, 10, 0.8)).toBe("exceeded");
  });
});

describe("applySpend", () => {
  it("accumulates spend and flips to exceeded with pauseReason budget", () => {
    const b = newBudget("loop:x", 10, NOW);
    const after = applySpend(b, 12, NOW);
    expect(after.spentUsd).toBe(12);
    expect(after.status).toBe("exceeded");
    expect(after.pauseReason).toBe("budget");
    expect(isExceeded(after)).toBe(true);
  });
  it("clears pauseReason while under the limit", () => {
    const b = newBudget("s", 10, NOW);
    const after = applySpend(b, 5, NOW);
    expect(after.status).toBe("active");
    expect(after.pauseReason).toBeUndefined();
  });
  it("ignores negative deltas (never refunds below recorded spend)", () => {
    const b = applySpend(newBudget("s", 10, NOW), 4, NOW);
    expect(applySpend(b, -3, NOW).spentUsd).toBe(4);
  });
});

describe("remainingUsd", () => {
  it("never goes negative", () => {
    expect(remainingUsd(applySpend(newBudget("s", 10, NOW), 4, NOW))).toBe(6);
    expect(remainingUsd(applySpend(newBudget("s", 10, NOW), 99, NOW))).toBe(0);
  });
});
