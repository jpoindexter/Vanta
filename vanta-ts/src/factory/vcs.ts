import type { VcsAdapter } from "./types.js";

// PORT-FACTORY-DEPS: the factory's git lifecycle behind one adapter. Lifted
// verbatim from run.ts's inline stages so behavior is unchanged; runCycle now
// calls these through FactoryDeps.vcs (default = defaultVcs). The factory runs
// git DIRECTLY (outside the kernel assess() gate); the merge safety story stays
// merge.ts:assessMergeRisk — this adapter only encapsulates the commands.

async function git(args: string[], cwd: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", args, { cwd });
  return stdout;
}

export const defaultVcs: VcsAdapter = {
  // --untracked-files=no: only flag tracked files with uncommitted edits.
  async isTreeDirty(root) {
    return (await git(["status", "--porcelain", "--untracked-files=no"], root)).trim().length > 0;
  },

  /** The branch HEAD is on right now (so we can restore it after a merge). */
  async currentBranch(root) {
    return (await git(["rev-parse", "--abbrev-ref", "HEAD"], root)).trim();
  },

  async createBranch(root) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16).replace("T", "-");
    const branch = `factory/auto-${ts}`;
    await git(["checkout", "-b", branch], root);
    return branch;
  },

  async commit(root, message) {
    await git(["add", "-A"], root);
    await git(["commit", "-m", message], root);
    return (await git(["rev-parse", "HEAD"], root)).trim().slice(0, 7);
  },

  async push(root) {
    // non-fatal: no remote configured
    await git(["push", "-u", "origin", "HEAD"], root).catch(() => "");
  },

  /**
   * Merge `source` into `target` with --no-ff (never force), then restore the
   * original branch. Returns true on a clean merge. Fails closed: a missing
   * target or a conflict aborts and returns false (caller stays at L4 push).
   */
  async merge(root, target, source, restoreTo) {
    try {
      // Target must already exist — creating an integration branch is itself a
      // mutation the operator should make deliberately (the opt-in landing zone).
      await git(["rev-parse", "--verify", target], root);
      await git(["checkout", target], root);
      await git(["merge", "--no-ff", "--no-edit", source], root);
      await git(["checkout", restoreTo], root).catch(() => "");
      return true;
    } catch {
      await git(["merge", "--abort"], root).catch(() => "");
      await git(["checkout", restoreTo], root).catch(() => "");
      return false;
    }
  },

  /** Changed lines (added + deleted) in the most recent commit (the slice). */
  async lastCommitLineCount(root) {
    const stdout = await git(["show", "--numstat", "--format=", "HEAD"], root);
    let total = 0;
    for (const line of stdout.trim().split("\n")) {
      const [add, del] = line.split("\t");
      total += (Number(add) || 0) + (Number(del) || 0); // "-" (binary) → 0
    }
    return total;
  },

  async discardSlice(root) {
    await git(["checkout", "."], root).catch(() => "");
    await git(["clean", "-fd", "--", "vanta-ts/src"], root).catch(() => "");
  },
};
