import { describe, it, expect } from "vitest";
import { parseBundle } from "./bundle.js";

const VALID_BUNDLE = `
name: "dev-workflow"
description: "Complete development workflow"
skills:
  - tdd-cycle
  - code-review
  - writing-plans
instruction: "Apply these workflows when coding"
`;

describe("parseBundle", () => {
  it("parses a valid bundle YAML", () => {
    const cfg = parseBundle(VALID_BUNDLE);
    expect(cfg).not.toBeNull();
    expect(cfg?.name).toBe("dev-workflow");
    expect(cfg?.description).toBe("Complete development workflow");
    expect(cfg?.skills).toEqual(["tdd-cycle", "code-review", "writing-plans"]);
    expect(cfg?.instruction).toBe("Apply these workflows when coding");
  });

  it("handles bundle without instruction", () => {
    const yaml = `name: "quick"\ndescription: "Quick bundle"\nskills:\n  - tdd-cycle\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.name).toBe("quick");
    expect(cfg?.instruction).toBeUndefined();
  });

  it("returns null for missing required fields", () => {
    expect(parseBundle("skills:\n  - foo\n")).toBeNull();
    expect(parseBundle("name: x\n")).toBeNull();
  });

  it("parses skills list with single quotes", () => {
    const yaml = `name: "x"\ndescription: "y"\nskills:\n  - 'tdd-cycle'\n  - 'code-review'\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.skills).toEqual(["tdd-cycle", "code-review"]);
  });

  it("returns empty skills list when no skills are listed", () => {
    const yaml = `name: "x"\ndescription: "y"\nskills:\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.skills).toEqual([]);
  });
});
