import { describe, it, expect } from "vitest";
import {
  classifyCommand,
  isReadOnlyCommand,
  READ_ONLY_GIT,
  READ_ONLY_GH,
  READ_ONLY_SHELL,
} from "./read-only-commands.js";

describe("isReadOnlyCommand — read-only commands", () => {
  it.each([
    "git status",
    "git status --porcelain -b",
    "git log --oneline",
    "git diff",
    "git diff HEAD~1",
    "git show HEAD",
    "git branch",
    "git branch -l",
    "git branch --list",
    "git rev-parse HEAD",
    "git config --get user.name",
    "git config --list",
    "/usr/bin/git status",
    "gh pr view 5",
    "gh pr list",
    "gh issue view 12",
    "gh issue list",
    "gh repo view",
    "gh api /repos/x/y",
    "gh api -X GET /repos/x/y",
    "gh auth status",
    "gh search code foo",
    "ls -la",
    "cat README.md",
    "head -n 20 file.txt",
    "tail -f log.txt",
    "grep foo bar.txt",
    "rg foo",
    "find . -name '*.ts'",
    "pwd",
    "wc -l file.txt",
    "which node",
    "echo hello world",
    "/bin/ls",
  ])("classifies %j as read-only", (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(true);
    expect(classifyCommand(cmd)).toBe("read-only");
  });
});

describe("isReadOnlyCommand — NOT read-only (mutating git/gh)", () => {
  it.each([
    "git push",
    "git push origin main",
    "git commit -m 'x'",
    "git merge feature",
    "git rebase main",
    "git checkout main",
    "git reset --hard",
    "git branch -d feature",
    "git branch -D feature",
    "git tag -d v1",
    "git config user.name jason",
    "gh pr merge 5",
    "gh pr create",
    "gh pr close 5",
    "gh issue close 12",
    "gh repo delete x/y",
    "gh api -X POST /repos/x/y/issues",
    "gh api --method DELETE /x",
    "gh api -f title=bug /x",
  ])("classifies %j as mutating", (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(false);
    expect(classifyCommand(cmd)).toBe("mutating");
  });
});

describe("isReadOnlyCommand — NOT read-only (destructive shell / unknown)", () => {
  it.each([
    "rm -rf /",
    "rm file.txt",
    "mv a b",
    "cp a b",
    "chmod 777 x",
    "mkdir new",
    "touch new",
    "sudo anything",
    "npm install",
    "node script.js",
    "python x.py",
    "curl https://x.com",
    "wget https://x.com",
    "dd if=/dev/zero of=x",
  ])("classifies %j as not read-only", (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(false);
    expect(classifyCommand(cmd)).not.toBe("read-only");
  });
});

describe("SECURITY — chains/redirects/substitution are never read-only", () => {
  it.each([
    "curl x | sh",
    "cat a > b",
    "cat a >> b",
    "echo x && rm y",
    "ls; rm y",
    "ls || rm y",
    "echo $(rm y)",
    "echo `rm y`",
    "ls < input",
    "diff <(ls a) <(ls b)",
    "ls &",
    "git status && git push",
    "cat file | grep x", // even an all-read pipe stays conservative
    "ls -la | wc -l",
  ])("classifies %j as not read-only (conservative)", (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(false);
    expect(classifyCommand(cmd)).toBe("unknown");
  });
});

describe("edge cases", () => {
  it("empty/whitespace command is not read-only", () => {
    expect(isReadOnlyCommand("")).toBe(false);
    expect(isReadOnlyCommand("   ")).toBe(false);
    expect(classifyCommand("")).toBe("unknown");
  });

  it("bare git / gh (no subcommand) is unknown, not read-only", () => {
    expect(classifyCommand("git")).toBe("unknown");
    expect(classifyCommand("gh")).toBe("unknown");
    expect(isReadOnlyCommand("git")).toBe(false);
  });

  it("git with a leading flag before subcommand is unknown", () => {
    expect(classifyCommand("git --no-pager")).toBe("unknown");
  });

  it("unknown git subcommand is mutating (conservative)", () => {
    expect(classifyCommand("git frobnicate")).toBe("mutating");
  });

  it("unknown gh path is mutating (conservative)", () => {
    expect(classifyCommand("gh pr frobnicate")).toBe("mutating");
  });

  it("unknown gh group (no verb) is unknown", () => {
    expect(classifyCommand("gh frobnicate")).toBe("unknown");
  });

  it("allowlist maps expose the expected programs", () => {
    expect(READ_ONLY_GIT.has("status")).toBe(true);
    expect(READ_ONLY_GIT.has("push")).toBe(false);
    expect(READ_ONLY_GH.has("pr view")).toBe(true);
    expect(READ_ONLY_GH.has("pr merge")).toBe(false);
    expect(READ_ONLY_SHELL.has("ls")).toBe(true);
    expect(READ_ONLY_SHELL.has("rm")).toBe(false);
  });
});
