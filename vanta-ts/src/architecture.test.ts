import { describe, it, expect } from "vitest";
import { checkBoundaries, RULES } from "./lint/boundaries.js";

/**
 * ARCH-BOUNDARY-FITNESS — enforces Vanta's ports/adapters standard in CI.
 * A new boundary violation fails this test. Rules live in lint/boundaries.ts.
 */
describe("architectural boundaries", () => {
  it("declares at least the code-intel port rule", () => {
    expect(RULES.some((r) => r.id === "code-intel-port")).toBe(true);
  });

  it("has zero error-severity boundary violations", () => {
    const errors = checkBoundaries().filter((v) => v.severity === "error");
    expect(errors, `boundary violations:\n${JSON.stringify(errors, null, 2)}`).toEqual([]);
  });
});
