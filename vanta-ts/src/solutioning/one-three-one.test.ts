import { describe, expect, it } from "vitest";
import {
  ONE_THREE_ONE_TEMPLATE,
  formatOneThreeOneDecision,
  isOneThreeOneDecision,
  type OneThreeOneDecision,
} from "./one-three-one.js";

const decision: OneThreeOneDecision = {
  problem: "The next roadmap slice needs to avoid external setup",
  options: [
    { name: "Ship zero-config reach", pros: ["uses public APIs"], cons: ["niche audience"] },
    { name: "Improve local TUI copy", pros: ["helps every user"], cons: ["does not prove remote reach"] },
    { name: "Capture a solutioning template", pros: ["small and reusable"], cons: ["not user-visible by itself"] },
  ],
  recommendation: "Ship zero-config reach first because it proves a real action without credentials",
  definitionOfDone: "The card is shipped with tests, roadmap proof, and no blocked external dependency",
};

describe("ONE_THREE_ONE_TEMPLATE", () => {
  it("captures the 1-3-1 shape with an attached Definition of Done", () => {
    expect(ONE_THREE_ONE_TEMPLATE).toContain("Problem: <one sentence>");
    expect(ONE_THREE_ONE_TEMPLATE).toContain("1. <option A>");
    expect(ONE_THREE_ONE_TEMPLATE).toContain("2. <option B>");
    expect(ONE_THREE_ONE_TEMPLATE).toContain("3. <option C>");
    expect(ONE_THREE_ONE_TEMPLATE).toContain("Definition of Done:");
  });
});

describe("isOneThreeOneDecision", () => {
  it("accepts one problem, exactly three distinct options, one recommendation, and a DoD", () => {
    expect(isOneThreeOneDecision(decision)).toBe(true);
  });

  it("rejects duplicate option names", () => {
    expect(isOneThreeOneDecision({
      ...decision,
      options: [decision.options[0], decision.options[0], decision.options[2]],
    })).toBe(false);
  });

  it("rejects an option without a pro or con", () => {
    expect(isOneThreeOneDecision({
      ...decision,
      options: [
        decision.options[0],
        { name: "Incomplete option", pros: [], cons: ["unknown cost"] },
        decision.options[2],
      ],
    })).toBe(false);
  });
});

describe("formatOneThreeOneDecision", () => {
  it("renders the exact three options plus recommendation and DoD", () => {
    const out = formatOneThreeOneDecision(decision);
    expect(out).toContain("Problem: The next roadmap slice needs to avoid external setup.");
    expect(out).toContain("1. Ship zero-config reach");
    expect(out).toContain("2. Improve local TUI copy");
    expect(out).toContain("3. Capture a solutioning template");
    expect(out).toContain("Recommendation: Ship zero-config reach first");
    expect(out).toContain("Definition of Done: The card is shipped with tests");
  });
});
