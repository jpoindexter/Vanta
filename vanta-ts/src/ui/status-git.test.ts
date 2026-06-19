import { describe, it, expect } from "vitest";
import { parseNumstatTotals, isLinkedWorktree } from "./status-git.js";

describe("parseNumstatTotals", () => {
  it("returns zeros for empty output", () => {
    expect(parseNumstatTotals("")).toEqual({ added: 0, removed: 0 });
  });
  it("sums added/removed across files", () => {
    const out = "12\t3\tsrc/a.ts\n4\t0\tsrc/b.ts\n0\t9\tsrc/c.ts";
    expect(parseNumstatTotals(out)).toEqual({ added: 16, removed: 12 });
  });
  it("counts binary rows ('-') as zero", () => {
    const out = "-\t-\timage.png\n5\t2\tsrc/a.ts";
    expect(parseNumstatTotals(out)).toEqual({ added: 5, removed: 2 });
  });
  it("ignores malformed lines", () => {
    const out = "garbage\n7\t1\tsrc/a.ts\nalso bad";
    expect(parseNumstatTotals(out)).toEqual({ added: 7, removed: 1 });
  });
});

describe("isLinkedWorktree", () => {
  it("is true when the git-dir is a linked worktree dir", () => {
    expect(
      isLinkedWorktree("/repo/.git/worktrees/feature", "/repo/.git"),
    ).toBe(true);
  });
  it("is false in the main checkout (git-dir == common-dir)", () => {
    expect(isLinkedWorktree("/repo/.git", "/repo/.git")).toBe(false);
  });
  it("is false when dirs differ but it is not a worktrees path", () => {
    expect(isLinkedWorktree("/repo/.git/modules/sub", "/repo/.git")).toBe(false);
  });
  it("ignores a trailing slash on either path", () => {
    expect(
      isLinkedWorktree("/repo/.git/worktrees/x/", "/repo/.git/"),
    ).toBe(true);
  });
});
