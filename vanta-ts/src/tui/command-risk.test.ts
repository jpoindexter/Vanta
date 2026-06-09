import { describe, it, expect } from "vitest";
import { getRiskTier, formatRiskLabel, COMMAND_RISKS } from "./command-risk.js";

describe("command-risk", () => {
  it("classifies local commands", () => {
    expect(getRiskTier("help")).toBe("local");
    expect(getRiskTier("clear")).toBe("local");
    expect(getRiskTier("history")).toBe("local");
    expect(getRiskTier("model")).toBe("local");
  });

  it("classifies approval-gated commands", () => {
    expect(getRiskTier("goal")).toBe("approval-gated");
    expect(getRiskTier("restart")).toBe("approval-gated");
    expect(getRiskTier("tasks")).toBe("approval-gated");
  });

  it("classifies kernel-gated commands", () => {
    expect(getRiskTier("add-dir")).toBe("kernel-gated");
  });

  it("defaults to kernel-gated for unmapped commands", () => {
    expect(getRiskTier("unknown-command")).toBe("kernel-gated");
  });

  it("formats risk labels", () => {
    expect(formatRiskLabel("local")).toBe("[local]");
    expect(formatRiskLabel("kernel-gated")).toBe("[kernel]");
    expect(formatRiskLabel("approval-gated")).toBe("[approval]");
  });

  it("has all slash commands mapped", () => {
    const unmapped = Object.keys(COMMAND_RISKS).filter(
      (cmd) => !COMMAND_RISKS[cmd as keyof typeof COMMAND_RISKS]
    );
    expect(unmapped).toHaveLength(0);
  });
});
