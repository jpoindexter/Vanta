import { describe, expect, it } from "vitest";
import { matchRule, tighten, type PermAction, type PermRule } from "./rules.js";

describe("tighten — the security core", () => {
  // The full 3×4 matrix: verdict {allow,ask,block} × ruleAction {allow,ask,deny,null}.
  // Each row is [verdict, ruleAction, expected]. This IS the safety test.
  const matrix: Array<[
    "allow" | "ask" | "block",
    PermAction | null,
    "allow" | "ask" | "block",
  ]> = [
    // kernel allow — a rule may escalate, never below allow
    ["allow", "allow", "allow"],
    ["allow", "ask", "ask"],
    ["allow", "deny", "block"],
    ["allow", null, "allow"],
    // kernel ask — allow auto-confirms, deny blocks, ask/null keep the prompt
    ["ask", "allow", "allow"],
    ["ask", "ask", "ask"],
    ["ask", "deny", "block"],
    ["ask", null, "ask"],
    // kernel block — IMMOVABLE: no rule may loosen it
    ["block", "allow", "block"],
    ["block", "ask", "block"],
    ["block", "deny", "block"],
    ["block", null, "block"],
  ];

  it.each(matrix)("tighten(%s, %s) === %s", (verdict, ruleAction, expected) => {
    expect(tighten(verdict, ruleAction)).toBe(expected);
  });

  it("kernel block is immovable for EVERY rule action (incl. allow + null)", () => {
    const ruleActions: Array<PermAction | null> = ["allow", "ask", "deny", null];
    for (const ra of ruleActions) {
      expect(tighten("block", ra)).toBe("block");
    }
  });

  it("a user allow rule never loosens a kernel block", () => {
    expect(tighten("block", "allow")).not.toBe("allow");
    expect(tighten("block", "allow")).toBe("block");
  });

  it("a deny rule is the only cross-vocabulary mapping (deny → block)", () => {
    expect(tighten("allow", "deny")).toBe("block");
    expect(tighten("ask", "deny")).toBe("block");
  });
});

describe("matchRule", () => {
  it("returns null when nothing matches", () => {
    const rules: PermRule[] = [{ action: "deny", tool: "shell_cmd" }];
    expect(matchRule(rules, "read_file", "read a file")).toBeNull();
  });

  it("a bare rule (no tool, no pattern) matches everything", () => {
    const rules: PermRule[] = [{ action: "ask" }];
    expect(matchRule(rules, "anything", "any descriptor")).toBe("ask");
  });

  it("tool-only rule matches by exact tool name, not substring", () => {
    const rules: PermRule[] = [{ action: "deny", tool: "shell_cmd" }];
    expect(matchRule(rules, "shell_cmd", "rm -rf")).toBe("deny");
    expect(matchRule(rules, "shell_cmd_extra", "x")).toBeNull();
  });

  it("pattern-only rule matches by substring on the descriptor", () => {
    const rules: PermRule[] = [{ action: "deny", pattern: "rm -rf" }];
    expect(matchRule(rules, "shell_cmd", "run: rm -rf /tmp")).toBe("deny");
    expect(matchRule(rules, "shell_cmd", "run: ls")).toBeNull();
  });

  it("more specific (tool+pattern) wins over less specific, regardless of order", () => {
    // Broad tool-only rule declared FIRST must not shadow the specific rule.
    const rules: PermRule[] = [
      { action: "allow", tool: "shell_cmd" },
      { action: "deny", tool: "shell_cmd", pattern: "rm -rf" },
    ];
    expect(matchRule(rules, "shell_cmd", "run: rm -rf /")).toBe("deny");
    expect(matchRule(rules, "shell_cmd", "run: ls")).toBe("allow");
  });

  it("tool-only beats pattern-only beats bare", () => {
    const rules: PermRule[] = [
      { action: "allow" }, // bare (score 0)
      { action: "ask", pattern: "secret" }, // pattern (score 1)
      { action: "deny", tool: "read_file" }, // tool (score 2)
    ];
    expect(matchRule(rules, "read_file", "read secret")).toBe("deny");
  });

  it("on equal specificity, the first matching rule wins", () => {
    const rules: PermRule[] = [
      { action: "allow", tool: "read_file" },
      { action: "deny", tool: "read_file" },
    ];
    expect(matchRule(rules, "read_file", "x")).toBe("allow");
  });
});
