import { describe, it, expect } from "vitest";
import { resolveSessionCap, isOverCap, buildCapExceededMessage } from "./session-cap.js";

const NO_ENV: NodeJS.ProcessEnv = {};
const withEnv = (value: string): NodeJS.ProcessEnv => ({ VANTA_MAX_BUDGET_USD: value });

describe("resolveSessionCap", () => {
  it("returns null when neither flag nor env is set", () => {
    expect(resolveSessionCap(NO_ENV)).toBeNull();
    expect(resolveSessionCap(NO_ENV, undefined)).toBeNull();
  });

  it("reads the cap from the env var", () => {
    expect(resolveSessionCap(withEnv("2.50"))).toBe(2.5);
  });

  it("prefers the flag over the env var", () => {
    expect(resolveSessionCap(withEnv("5"), "1.25")).toBe(1.25);
  });

  it("accepts a numeric flag value", () => {
    expect(resolveSessionCap(NO_ENV, 3)).toBe(3);
  });

  it("returns null for a zero, negative, or non-numeric value", () => {
    expect(resolveSessionCap(withEnv("0"))).toBeNull();
    expect(resolveSessionCap(withEnv("-1"))).toBeNull();
    expect(resolveSessionCap(withEnv("abc"))).toBeNull();
    expect(resolveSessionCap(withEnv(""))).toBeNull();
    expect(resolveSessionCap(NO_ENV, "nope")).toBeNull();
  });
});

describe("isOverCap", () => {
  it("is never over when there is no cap", () => {
    expect(isOverCap(0, null)).toBe(false);
    expect(isOverCap(9999, null)).toBe(false);
  });

  it("is under the cap below the limit", () => {
    expect(isOverCap(1.99, 2)).toBe(false);
  });

  it("is over the cap at or above the limit", () => {
    expect(isOverCap(2, 2)).toBe(true);
    expect(isOverCap(2.01, 2)).toBe(true);
  });
});

describe("buildCapExceededMessage", () => {
  it("names the current spend and the cap", () => {
    const msg = buildCapExceededMessage(2.5, 2);
    expect(msg).toContain("$2.50");
    expect(msg).toContain("$2.00");
    expect(msg).toMatch(/budget cap reached/i);
    expect(msg).toContain("--max-budget-usd");
  });
});
