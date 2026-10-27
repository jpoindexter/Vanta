import { describe, expect, it } from "vitest";
import { HireBody, RaiseBudgetBody } from "./company-write-schemas.js";

describe("company write schema error contract", () => {
  it("preserves the required-field recovery message", () => {
    const result = HireBody.safeParse({ adapter: "openai" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('role is required (for example "Engineer")');
  });

  it("distinguishes missing amounts from invalid amount types", () => {
    for (const [input, message] of [
      [{ scope: "agent:fixture" }, "limitUsd is required"],
      [{ scope: "agent:fixture", limitUsd: "5" }, "limitUsd must be a number of US dollars"],
    ] as const) {
      const result = RaiseBudgetBody.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe(message);
    }
  });

  it("still rejects zero budgets and unknown request fields", () => {
    expect(RaiseBudgetBody.safeParse({ scope: "agent:fixture", limitUsd: 0 }).success).toBe(false);
    expect(HireBody.safeParse({ role: "Engineer", adapter: "openai", unexpected: true }).success).toBe(false);
  });
});
