import { describe, expect, it } from "vitest";
import { buildOsintPlan, formatOsintPlan } from "./framework.js";

describe("buildOsintPlan", () => {
  it("builds a no-key public-records plan with entity-resolution guardrails", () => {
    const plan = buildOsintPlan("  Acme   Holdings  ", {
      domain: "ACME.example",
      ticker: "acme",
      jurisdiction: "Delaware",
    });

    expect(plan.normalizedSubject).toBe("Acme Holdings");
    expect(plan.identifiers).toEqual([
      { kind: "name", value: "Acme Holdings" },
      { kind: "domain", value: "acme.example" },
      { kind: "ticker", value: "ACME" },
      { kind: "jurisdiction", value: "Delaware" },
    ]);
    expect(plan.sources.map((source) => source.id)).toEqual([
      "sec-edgar",
      "usaspending",
      "ofac-sanctions",
      "opencorporates",
      "courtlistener",
      "icann-lookup",
    ]);
    expect(plan.guardrails).toContain("No API keys are required by this planner.");
    expect(plan.evidenceFields.map((field) => field.name)).toContain("expiresAt");
  });

  it("requires a subject", () => {
    expect(() => buildOsintPlan("   ")).toThrow("subject is required");
  });
});

describe("formatOsintPlan", () => {
  it("renders source starts and evidence receipt schema", () => {
    const text = formatOsintPlan(buildOsintPlan("Acme", { domain: "acme.example" }));

    expect(text).toContain("OSINT plan: Acme");
    expect(text).toContain("sec-edgar");
    expect(text).toContain("icann-lookup");
    expect(text).toContain("Evidence receipt fields");
    expect(text).toContain("retrievedAt *");
  });
});
