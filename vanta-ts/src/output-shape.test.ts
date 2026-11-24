import { describe, expect, it } from "vitest";
import { stableTier } from "./prompt-tiers.js";

describe("assistant output shape", () => {
  it("keeps the final answer outcome-first and avoids duplicating host evidence", () => {
    const prompt = stableTier("# Vanta", "/repo", []);

    expect(prompt).toContain("The host already renders tool activity and a deterministic run summary");
    expect(prompt).toContain("Use descriptive headings only when the answer has two or more logical groups");
    expect(prompt).toContain("Do not repeat every tool call, diff, or receipt");
  });
});
