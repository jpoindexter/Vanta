import { describe, it, expect } from "vitest";
import { BODY_DOUBLE_SKILL } from "./body-double.js";

describe("BODY_DOUBLE_SKILL", () => {
  it("has name body-double", () => {
    expect(BODY_DOUBLE_SKILL.name).toBe("body-double");
  });

  it("description mentions co-working or quiet", () => {
    const desc = BODY_DOUBLE_SKILL.description.toLowerCase();
    expect(desc.includes("co-working") || desc.includes("quiet")).toBe(true);
  });

  it("body is non-empty", () => {
    expect(BODY_DOUBLE_SKILL.body.trim().length).toBeGreaterThan(0);
  });
});
