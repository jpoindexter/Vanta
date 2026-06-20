import { describe, it, expect } from "vitest";
import {
  proposeReadOnlyRules,
  formatRulesProposal,
  isReadOnlySafeTool,
  READ_ONLY_SAFE_TOOLS,
  DEFAULT_PROPOSE_THRESHOLD,
  type SessionToolCall,
} from "./less-perms-cmd.js";
import { DEFAULT_AUTO_MODE_CONFIG } from "../permissions/auto-mode.js";

function calls(...names: string[]): SessionToolCall[] {
  return names.map((name) => ({ name }));
}

describe("READ_ONLY_SAFE_TOOLS", () => {
  it("is derived from the auto-mode allow rules (single source of truth)", () => {
    const autoAllow = DEFAULT_AUTO_MODE_CONFIG.rules
      .filter((r) => r.action === "allow" && r.tool)
      .map((r) => r.tool);
    for (const tool of autoAllow) expect(READ_ONLY_SAFE_TOOLS.has(tool!)).toBe(true);
  });

  it("includes known read-only tools and excludes mutating ones", () => {
    expect(isReadOnlySafeTool("read_file")).toBe(true);
    expect(isReadOnlySafeTool("grep_files")).toBe(true);
    expect(isReadOnlySafeTool("write_file")).toBe(false);
    expect(isReadOnlySafeTool("shell_cmd")).toBe(false);
  });
});

describe("proposeReadOnlyRules", () => {
  it("proposes a read-only tool used at/above the threshold", () => {
    const rules = proposeReadOnlyRules(calls("read_file", "read_file"));
    expect(rules).toEqual([{ action: "allow", tool: "read_file" }]);
  });

  it("uses a default threshold of 2", () => {
    expect(DEFAULT_PROPOSE_THRESHOLD).toBe(2);
    expect(proposeReadOnlyRules(calls("read_file"))).toEqual([]);
  });

  it("skips below-threshold tools", () => {
    const rules = proposeReadOnlyRules(calls("read_file", "grep_files"));
    expect(rules).toEqual([]);
  });

  it("NEVER proposes a mutating tool even when frequent", () => {
    const rules = proposeReadOnlyRules(
      calls("write_file", "write_file", "write_file", "shell_cmd", "shell_cmd", "shell_cmd"),
    );
    expect(rules).toEqual([]);
  });

  it("excludes mutating tools but keeps the safe ones in a mixed session", () => {
    const rules = proposeReadOnlyRules(
      calls("read_file", "read_file", "write_file", "write_file", "shell_cmd", "shell_cmd"),
    );
    expect(rules).toEqual([{ action: "allow", tool: "read_file" }]);
  });

  it("dedupes — one rule per tool regardless of call count", () => {
    const rules = proposeReadOnlyRules(calls("grep_files", "grep_files", "grep_files", "grep_files"));
    expect(rules).toEqual([{ action: "allow", tool: "grep_files" }]);
    expect(rules.filter((r) => r.tool === "grep_files")).toHaveLength(1);
  });

  it("sorts by descending use count, then name", () => {
    const rules = proposeReadOnlyRules(
      calls("grep_files", "grep_files", "read_file", "read_file", "read_file"),
    );
    expect(rules.map((r) => r.tool)).toEqual(["read_file", "grep_files"]);
  });

  it("breaks count ties by tool name", () => {
    const rules = proposeReadOnlyRules(
      calls("grep_files", "grep_files", "glob_files", "glob_files"),
    );
    expect(rules.map((r) => r.tool)).toEqual(["glob_files", "grep_files"]);
  });

  it("honors a custom threshold", () => {
    const rules = proposeReadOnlyRules(calls("read_file", "read_file", "read_file"), { threshold: 3 });
    expect(rules).toEqual([{ action: "allow", tool: "read_file" }]);
    expect(proposeReadOnlyRules(calls("read_file", "read_file"), { threshold: 3 })).toEqual([]);
  });

  it("returns an empty array for no tool calls", () => {
    expect(proposeReadOnlyRules([])).toEqual([]);
  });

  it("only ever proposes allow rules for safe tools", () => {
    const rules = proposeReadOnlyRules(
      calls("read_file", "read_file", "grep_files", "grep_files", "shell_cmd", "shell_cmd"),
    );
    for (const rule of rules) {
      expect(rule.action).toBe("allow");
      expect(isReadOnlySafeTool(rule.tool!)).toBe(true);
    }
  });
});

describe("formatRulesProposal", () => {
  it("gives a clean 'nothing to propose' message when empty", () => {
    const text = formatRulesProposal([]);
    expect(text).toContain("nothing to allow yet");
    expect(text).not.toContain("1.");
  });

  it("numbers each proposed rule and shows the tool", () => {
    const text = formatRulesProposal([
      { action: "allow", tool: "read_file" },
      { action: "allow", tool: "grep_files" },
    ]);
    expect(text).toContain("1. allow read_file");
    expect(text).toContain("2. allow grep_files");
  });

  it("states it only proposes and points to the manual accept command (no auto-grant)", () => {
    const text = formatRulesProposal([{ action: "allow", tool: "read_file" }]);
    expect(text).toContain("only PROPOSE");
    expect(text).toContain("/permissions allow");
  });
});
