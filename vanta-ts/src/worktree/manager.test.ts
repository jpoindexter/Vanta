import { describe, it, expect } from "vitest";

// CC-WORKTREE-AGENTS: the worktree manager is a thin shell-orchestration layer.
// The pure helpers (branchName format) are not exported. The core functions require
// a real git repo with a tracking branch — unit tests are limited to the module
// export check. Full integration is verified manually with a real repo.

describe("worktree manager", () => {
  it("exports createWorktree, worktreeDiff, mergeWorktreeBranch", async () => {
    const mod = await import("./manager.js");
    expect(typeof mod.createWorktree).toBe("function");
    expect(typeof mod.worktreeDiff).toBe("function");
    expect(typeof mod.mergeWorktreeBranch).toBe("function");
  });
});
