import { describe, expect, it } from "vitest";
import { isGitHooksPath, gitHooksWarning } from "./git-hooks-guard.js";

describe("isGitHooksPath", () => {
  it("matches a .husky segment anywhere in the path", () => {
    for (const p of [
      ".husky/pre-commit",
      "./.husky/pre-commit",
      "/Users/x/proj/.husky/pre-push",
      "repo/.husky/_/husky.sh",
      "/abs/.husky/commit-msg",
    ]) {
      expect(isGitHooksPath(p)).toBe(true);
    }
  });

  it("matches a .git/hooks segment pair anywhere in the path", () => {
    for (const p of [
      ".git/hooks/pre-commit",
      "path/.git/hooks/pre-push",
      "/Users/x/proj/.git/hooks/post-merge",
      "./.git/hooks/prepare-commit-msg",
    ]) {
      expect(isGitHooksPath(p)).toBe(true);
    }
  });

  it("matches with backslash separators", () => {
    expect(isGitHooksPath("repo\\.husky\\pre-commit")).toBe(true);
    expect(isGitHooksPath("repo\\.git\\hooks\\pre-push")).toBe(true);
  });

  it("does NOT match normal source/doc files", () => {
    for (const p of [
      "src/foo.ts",
      "README.md",
      "notes.txt",
      "/Users/x/index.tsx",
      "config.json",
    ]) {
      expect(isGitHooksPath(p)).toBe(false);
    }
  });

  it("does NOT match a file merely named hooks", () => {
    for (const p of [
      "hooks.ts",
      "src/hooks.ts",
      "src/hooks/index.ts",
      "/Users/x/lib/hooks.js",
    ]) {
      expect(isGitHooksPath(p)).toBe(false);
    }
  });

  it("does NOT match lookalike segments (substring, not segment)", () => {
    for (const p of [
      "myhusky/x",
      "src/husky.ts",
      ".husky-backup/pre-commit",
      "notgit/hooks/pre-commit",
      ".git-old/hooks/pre-commit",
    ]) {
      expect(isGitHooksPath(p)).toBe(false);
    }
  });

  it("does NOT match .git without an immediate hooks child", () => {
    for (const p of [
      ".git/config",
      "repo/.git/objects/ab/cdef",
      ".git/refs/heads/main",
    ]) {
      expect(isGitHooksPath(p)).toBe(false);
    }
  });
});

describe("gitHooksWarning", () => {
  it("names the path and the run-on-git-operation risk", () => {
    const msg = gitHooksWarning(".husky/pre-commit");
    expect(msg).toContain(".husky/pre-commit");
    expect(msg.toLowerCase()).toContain("code-execution-on-commit");
    expect(msg.toLowerCase()).toContain("run automatically on git");
  });
});
