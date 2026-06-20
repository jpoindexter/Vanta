import { describe, expect, it } from "vitest";
import { findShadowedRules, buildShadowWarning } from "./shadow-detect.js";
import type { PermRule } from "./rules.js";

describe("findShadowedRules", () => {
  it("returns none for an empty rule list", () => {
    expect(findShadowedRules([])).toEqual([]);
  });

  it("returns none for a single rule", () => {
    expect(findShadowedRules([{ action: "allow", tool: "shell_cmd" }])).toEqual([]);
  });

  it("flags a later allow shadowed by an earlier broader deny on the same tool", () => {
    // The card's headline case: deny shell_cmd * (no pattern = any descriptor)
    // already covers `git status`, so the later allow can never fire.
    const rules: PermRule[] = [
      { action: "deny", tool: "shell_cmd" },
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
    ];
    const shadowed = findShadowedRules(rules);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.rule).toEqual(rules[1]);
    expect(shadowed[0]?.index).toBe(1);
    expect(shadowed[0]?.shadowedBy).toEqual(rules[0]);
    expect(shadowed[0]?.shadowedByIndex).toBe(0);
  });

  it("flags a later rule broadened (made more specific) under an earlier broader pattern", () => {
    // earlier pattern "git" covers later pattern "git status" (the longer one
    // contains the shorter), so the later rule is unreachable.
    const rules: PermRule[] = [
      { action: "ask", tool: "shell_cmd", pattern: "git" },
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
    ];
    const shadowed = findShadowedRules(rules);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.rule).toEqual(rules[1]);
  });

  it("flags an exact duplicate rule", () => {
    const rule: PermRule = { action: "deny", tool: "write_file", pattern: "secret" };
    const shadowed = findShadowedRules([rule, { ...rule }]);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.index).toBe(1);
    expect(shadowed[0]?.shadowedByIndex).toBe(0);
  });

  it("flags a more-specific rule AFTER a broad rule of the OPPOSITE decision (first-match wins)", () => {
    // A blanket allow * (any tool, any pattern) followed by a narrow deny: the
    // earlier blanket governs everything, so the deny is dead — the operator's
    // attempt to carve out an exception silently fails.
    const rules: PermRule[] = [
      { action: "allow" },
      { action: "deny", tool: "shell_cmd", pattern: "rm -rf" },
    ];
    const shadowed = findShadowedRules(rules);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.rule).toEqual(rules[1]);
    expect(shadowed[0]?.shadowedBy).toEqual(rules[0]);
  });

  it("does NOT flag independent rules on different tools", () => {
    const rules: PermRule[] = [
      { action: "deny", tool: "shell_cmd" },
      { action: "allow", tool: "read_file" },
    ];
    expect(findShadowedRules(rules)).toEqual([]);
  });

  it("does NOT flag independent rules with non-overlapping patterns on the same tool", () => {
    const rules: PermRule[] = [
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
      { action: "deny", tool: "shell_cmd", pattern: "rm -rf" },
    ];
    expect(findShadowedRules(rules)).toEqual([]);
  });

  it("does NOT flag a broad rule placed AFTER a narrow one (order matters)", () => {
    // The narrow rule comes first, so the later broad rule still has reachable
    // targets the narrow one doesn't cover — it is not shadowed.
    const rules: PermRule[] = [
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
      { action: "deny", tool: "shell_cmd" },
    ];
    expect(findShadowedRules(rules)).toEqual([]);
  });

  it("does NOT flag a same-tool rule whose pattern is broader than (not contained by) the earlier one", () => {
    // earlier "git status" does not cover later "git" — a descriptor like
    // "git log" matches the later rule but not the earlier, so it is reachable.
    const rules: PermRule[] = [
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
      { action: "deny", tool: "shell_cmd", pattern: "git" },
    ];
    expect(findShadowedRules(rules)).toEqual([]);
  });

  it("attributes a shadowed rule to the FIRST earlier rule that covers it", () => {
    const rules: PermRule[] = [
      { action: "deny", tool: "shell_cmd" },
      { action: "ask", tool: "shell_cmd" },
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
    ];
    const shadowed = findShadowedRules(rules);
    // both #1 and #2 cover #3, but the second rule (#2 ask) is also covered by #1.
    expect(shadowed).toHaveLength(2);
    expect(shadowed[0]?.index).toBe(1);
    expect(shadowed[0]?.shadowedByIndex).toBe(0);
    expect(shadowed[1]?.index).toBe(2);
    expect(shadowed[1]?.shadowedByIndex).toBe(0);
  });

  it("flags every later rule when a bare match-all rule leads the list", () => {
    const rules: PermRule[] = [
      { action: "ask" },
      { action: "allow", tool: "read_file" },
      { action: "deny", tool: "shell_cmd", pattern: "rm" },
    ];
    const shadowed = findShadowedRules(rules);
    expect(shadowed.map((s) => s.index)).toEqual([1, 2]);
    expect(shadowed.every((s) => s.shadowedByIndex === 0)).toBe(true);
  });
});

describe("buildShadowWarning", () => {
  it("returns an empty string when nothing is shadowed (silent)", () => {
    expect(buildShadowWarning([])).toBe("");
    expect(buildShadowWarning(findShadowedRules([]))).toBe("");
  });

  it("emits one line per shadowed rule with the covering rule cited", () => {
    const rules: PermRule[] = [
      { action: "deny", tool: "shell_cmd" },
      { action: "allow", tool: "shell_cmd", pattern: "git status" },
    ];
    const warning = buildShadowWarning(findShadowedRules(rules));
    const lines = warning.split("\n");
    expect(lines).toHaveLength(2); // header + one rule line
    expect(lines[0]).toContain("1 unreachable permission rule");
    expect(lines[1]).toContain("rule #2");
    expect(lines[1]).toContain("allow shell_cmd git status");
    expect(lines[1]).toContain("#1");
    expect(lines[1]).toContain("deny shell_cmd *");
  });

  it("pluralizes the header and lists each shadowed rule", () => {
    const rules: PermRule[] = [
      { action: "ask" },
      { action: "allow", tool: "read_file" },
      { action: "deny", tool: "shell_cmd", pattern: "rm" },
    ];
    const warning = buildShadowWarning(findShadowedRules(rules));
    const lines = warning.split("\n");
    expect(lines[0]).toContain("2 unreachable permission rules");
    expect(lines).toHaveLength(3); // header + two rule lines
  });
});
