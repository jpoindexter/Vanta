import { describe, it, expect } from "vitest";
import { guardBeforeTurn } from "./guard.js";
import { newBudget, applySpend, type Budget } from "./types.js";

// VANTA-COST-GUARD — pre-turn warn/halt/ask decision.

const T = new Date("2026-07-07T00:00:00Z");
const budget = (spent: number, limit = 10): Budget => applySpend(newBudget("run", limit, T), spent, T);

describe("guardBeforeTurn", () => {
  it("allows when no budget is set", () => {
    expect(guardBeforeTurn(null, 5).action).toBe("allow");
  });

  it("allows when well under the ceiling", () => {
    expect(guardBeforeTurn(budget(2), 1).action).toBe("allow"); // 2 + 1 = 3 of 10
  });

  it("warns in the warning band (≥80% of the limit, next turn still fits)", () => {
    const d = guardBeforeTurn(budget(8.5), 0.2); // 85% spent, +0.2 stays < 10
    expect(d.action).toBe("warn");
    expect(d.message).toContain("of $10.00");
  });

  it("halts BEFORE the turn that would cross the ceiling", () => {
    const d = guardBeforeTurn(budget(9), 2); // 9 + 2 = 11 > 10 → would cross
    expect(d.action).toBe("halt");
    expect(d.message).toContain("would exceed");
  });

  it("halts when already exceeded, regardless of the next estimate", () => {
    expect(guardBeforeTurn(budget(10.5), 0).action).toBe("halt");
  });

  it("asks instead of halting in ask mode", () => {
    const d = guardBeforeTurn(budget(9.5), 1, "ask");
    expect(d.action).toBe("ask");
    expect(d.message).toContain("Continue anyway?");
  });

  it("with an unknown next estimate (0), only current spend gates", () => {
    expect(guardBeforeTurn(budget(5), 0).action).toBe("allow"); // 50%, no projection
    expect(guardBeforeTurn(budget(9), 0).action).toBe("warn"); // 90%, warn but no cross
  });
});
