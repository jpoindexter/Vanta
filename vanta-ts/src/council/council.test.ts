import { describe, it, expect } from "vitest";
import {
  runCouncil,
  formatCouncil,
  COUNCIL_ROLES,
  COUNCIL_CAP,
  type CouncilRole,
  type RoleRunner,
} from "./council.js";

/** A fake role-runner: deliberators echo their lens; the synthesis role lists
 *  who it consolidated. No LLM, no spawn — pure orchestration under test. */
function fakeRunner(calls: { role: string; hasPriors: boolean }[]): RoleRunner {
  return async ({ role, priorAnswers }) => {
    calls.push({ role: role.name, hasPriors: priorAnswers !== undefined });
    if (priorAnswers) {
      return `synthesis of ${priorAnswers.map((a) => a.role).join(",")}`;
    }
    return `${role.name} view: ${role.lens}`;
  };
}

describe("runCouncil", () => {
  it("fans the question across every deliberating role from its lens", async () => {
    const calls: { role: string; hasPriors: boolean }[] = [];
    const result = await runCouncil("Should we ship X?", { runRole: fakeRunner(calls) });

    // Default roster: 5 roles → 4 deliberators + 1 synthesis.
    expect(result.answers).toHaveLength(COUNCIL_ROLES.length - 1);
    expect(result.answers.map((a) => a.role)).toEqual(["CEO", "CTO", "COO", "CFO"]);
    for (const a of result.answers) {
      expect(a.answer).toBe(`${a.role} view: ${a.lens}`);
    }
  });

  it("runs a synthesis/reflection step that consolidates the role answers into one recommendation", async () => {
    const calls: { role: string; hasPriors: boolean }[] = [];
    const result = await runCouncil("Pick a database", { runRole: fakeRunner(calls) });

    // The LAST call is the synthesis role, and it alone receives priorAnswers.
    const synthesisCall = calls.at(-1);
    expect(synthesisCall?.role).toBe("Reflection");
    expect(synthesisCall?.hasPriors).toBe(true);
    expect(calls.filter((c) => c.hasPriors)).toHaveLength(1); // exactly one synthesis pass
    expect(result.recommendation).toBe("synthesis of CEO,CTO,COO,CFO");
  });

  it("is bounded: a single deliberation pass — each role runs exactly once, no recursion", async () => {
    const calls: { role: string; hasPriors: boolean }[] = [];
    await runCouncil("One pass only", { runRole: fakeRunner(calls) });
    // 4 deliberators + 1 synthesis = 5 calls total, each role once.
    expect(calls).toHaveLength(COUNCIL_ROLES.length);
    const names = calls.map((c) => c.role);
    expect(new Set(names).size).toBe(names.length); // no role called twice
  });

  it("enforces the roster cap (refuses an oversized council)", async () => {
    const oversized: CouncilRole[] = Array.from({ length: COUNCIL_CAP + 1 }, (_, i) => ({
      name: `R${i}`,
      lens: "x",
      brief: "y",
    }));
    await expect(
      runCouncil("q", { runRole: async () => "x", roster: oversized }),
    ).rejects.toThrow(/capped at/);
  });

  it("refuses a roster too small to deliberate-and-synthesize", async () => {
    await expect(
      runCouncil("q", { runRole: async () => "x", roster: [{ name: "Solo", lens: "x", brief: "y" }] }),
    ).rejects.toThrow(/at least 2/);
  });

  it("refuses an empty question (errors before any role runs)", async () => {
    let ran = false;
    await expect(
      runCouncil("   ", { runRole: async () => { ran = true; return "x"; } }),
    ).rejects.toThrow(/non-empty/);
    expect(ran).toBe(false);
  });

  it("honors a custom bounded roster", async () => {
    const calls: { role: string; hasPriors: boolean }[] = [];
    const roster: CouncilRole[] = [
      { name: "Product", lens: "user value", brief: "judge value" },
      { name: "Reflection", lens: "synthesis", brief: "consolidate" },
    ];
    const result = await runCouncil("q", { runRole: fakeRunner(calls), roster });
    expect(result.answers.map((a) => a.role)).toEqual(["Product"]);
    expect(result.recommendation).toBe("synthesis of Product");
  });

  it("COUNCIL_ROLES is within the cap and ends with the synthesis role", () => {
    expect(COUNCIL_ROLES.length).toBeLessThanOrEqual(COUNCIL_CAP);
    expect(COUNCIL_ROLES.at(-1)?.name).toBe("Reflection");
  });
});

describe("formatCouncil", () => {
  it("renders each lens and the consolidated recommendation", async () => {
    const calls: { role: string; hasPriors: boolean }[] = [];
    const result = await runCouncil("Ship?", { runRole: fakeRunner(calls) });
    const text = formatCouncil("Ship?", result);
    expect(text).toContain("Council on: Ship?");
    expect(text).toContain("[CEO · vision, strategy, and overall direction]");
    expect(text).toContain("[Recommendation]");
    expect(text).toContain(result.recommendation);
  });
});
