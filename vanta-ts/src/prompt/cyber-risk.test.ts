import { describe, it, expect } from "vitest";
import { cyberRiskSection } from "./cyber-risk.js";

describe("cyberRiskSection", () => {
  const section = cyberRiskSection();

  it("allows the legitimate security uses (defensive / CTF / authorized pentest / education)", () => {
    expect(section).toContain("defensive security");
    expect(section).toContain("CTF");
    expect(section).toContain("authorized pentest");
    expect(section).toContain("education");
  });

  it("refuses the malicious uses (destructive / DoS / mass-targeting / supply-chain / evasion)", () => {
    expect(section).toMatch(/refuse/i);
    expect(section).toContain("destructive");
    expect(section).toContain("denial-of-service");
    expect(section).toContain("mass-targeting");
    expect(section).toContain("supply-chain");
    expect(section).toContain("malicious-evasion");
  });

  it("requires an authorization context for dual-use tooling", () => {
    expect(section).toContain("Dual-use");
    expect(section).toMatch(/authoriz/i);
  });

  it("stays a concise rule — a few tight lines, not paragraphs", () => {
    expect(section.length).toBeLessThan(400);
    expect(section).not.toContain("\n\n"); // no paragraph breaks
  });
});
