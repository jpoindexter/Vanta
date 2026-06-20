import { describe, it, expect } from "vitest";
import { parseTokenBudget } from "./token-budget.js";

describe("parseTokenBudget — directive forms", () => {
  it("parses a `+500k` shorthand", () => {
    expect(parseTokenBudget("+500k")).toBe(500_000);
  });

  it("parses a `+2m` shorthand (case-insensitive M)", () => {
    expect(parseTokenBudget("+2M")).toBe(2_000_000);
    expect(parseTokenBudget("+2m")).toBe(2_000_000);
  });

  it("parses `use 2M tokens`", () => {
    expect(parseTokenBudget("use 2M tokens")).toBe(2_000_000);
  });

  it("parses `budget 1000000 tokens` (explicit count, no suffix)", () => {
    expect(parseTokenBudget("budget 1000000 tokens")).toBe(1_000_000);
  });

  it("parses a decimal `1.5m`", () => {
    expect(parseTokenBudget("1.5m")).toBe(1_500_000);
  });

  it("parses a decimal `1.5m tokens`", () => {
    expect(parseTokenBudget("budget 1.5m tokens")).toBe(1_500_000);
  });

  it("is case-insensitive on the suffix", () => {
    expect(parseTokenBudget("+500K")).toBe(500_000);
    expect(parseTokenBudget("use 3K tokens")).toBe(3_000);
  });

  it("is whitespace-tolerant between number, suffix, and 'tokens'", () => {
    expect(parseTokenBudget("use 2 m tokens")).toBe(2_000_000);
    expect(parseTokenBudget("budget  1000000  tokens")).toBe(1_000_000);
  });

  it("finds the directive embedded in a longer message", () => {
    expect(parseTokenBudget("go ahead and refactor this, +500k should be plenty")).toBe(500_000);
    expect(parseTokenBudget("please use 2m tokens for the deep dive")).toBe(2_000_000);
  });
});

describe("parseTokenBudget — null cases (no directive)", () => {
  it("returns null for an empty / whitespace message", () => {
    expect(parseTokenBudget("")).toBeNull();
    expect(parseTokenBudget("   ")).toBeNull();
  });

  it("returns null for a bare number with no k/m suffix and no 'token' word", () => {
    expect(parseTokenBudget("run 5 tests")).toBeNull();
    expect(parseTokenBudget("500")).toBeNull();
    expect(parseTokenBudget("read the first 500 lines")).toBeNull();
  });

  it("returns null for a currency amount", () => {
    expect(parseTokenBudget("$500")).toBeNull();
    expect(parseTokenBudget("500 dollars")).toBeNull();
    expect(parseTokenBudget("it costs $1.5m")).toBeNull();
  });

  it("returns null for an ordinary message with no number at all", () => {
    expect(parseTokenBudget("fix the failing test in src/index.ts")).toBeNull();
  });

  it("returns null when a non-string is passed", () => {
    // @ts-expect-error — defensive: the boundary may hand a non-string.
    expect(parseTokenBudget(undefined)).toBeNull();
    // @ts-expect-error
    expect(parseTokenBudget(null)).toBeNull();
  });
});

describe("parseTokenBudget — precedence + edge cases", () => {
  it("prefers the 'tokens'-qualified amount over a stray suffixed number", () => {
    // `$5` is currency noise; the real budget is the token-qualified count.
    expect(parseTokenBudget("ignore the $5k tip, budget 1000000 tokens")).toBe(1_000_000);
  });

  it("treats a zero budget as no budget (null)", () => {
    expect(parseTokenBudget("budget 0 tokens")).toBeNull();
    expect(parseTokenBudget("+0k")).toBeNull();
  });

  it("rounds a fractional token count to an integer", () => {
    // 0.0015m = 1500 exactly; 1.2345m rounds.
    expect(parseTokenBudget("use 1.2345m tokens")).toBe(1_234_500);
  });
});
