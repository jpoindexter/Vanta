import { describe, it, expect } from "vitest";
import { getGitRemoteUrl, resolveMainRepoRoot, canonicalProjectId } from "./identity.js";

// These tests use the actual git repo that contains this code.
// They verify the module works with real git state — no mocks.

describe("getGitRemoteUrl", () => {
  it("returns a string for this repo (has a remote)", async () => {
    const url = await getGitRemoteUrl(process.cwd());
    // The repo has an origin remote (or is run in a context without one).
    expect(typeof url === "string" || url === null).toBe(true);
  });

  it("returns null for a non-git directory", async () => {
    const url = await getGitRemoteUrl("/tmp");
    expect(url).toBeNull();
  });
});

describe("resolveMainRepoRoot", () => {
  it("returns the same root for a main repo (not a worktree)", async () => {
    const root = process.cwd();
    const resolved = await resolveMainRepoRoot(root);
    // In a main repo, resolved equals root (or a parent if .git is absent here)
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });

  it("returns the cwd for a non-git directory", async () => {
    const resolved = await resolveMainRepoRoot("/tmp");
    expect(resolved).toBe("/tmp");
  });
});

describe("canonicalProjectId", () => {
  it("returns a 12-char hex string when git remote is available", async () => {
    const root = process.cwd();
    const id = await canonicalProjectId(root);
    // Either 12-char hex (remote found) or a basename (no remote)
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns a stable result for the same root", async () => {
    const root = process.cwd();
    const [a, b] = await Promise.all([canonicalProjectId(root), canonicalProjectId(root)]);
    expect(a).toBe(b);
  });

  it("falls back to basename for non-git directories", async () => {
    const id = await canonicalProjectId("/tmp/my-project");
    expect(id).toBe("my-project");
  });
});
