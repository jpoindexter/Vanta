import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Worktree agents: git worktree isolation for parallel subagents.
// Each isolated agent runs in a fresh worktree on its own branch so parallel
// code-editing agents don't conflict. Cleanup removes the worktree after use.

const run = promisify(execFile);

export type WorktreeHandle = {
  path: string;
  branch: string;
  cleanup: () => Promise<void>;
};

function branchName(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}/${ts}-${rand}`;
}

/**
 * Create a fresh git worktree on a new branch.
 * Returns the worktree path, branch name, and a cleanup function.
 * The cleanup removes the worktree directory and deletes the branch.
 */
export async function createWorktree(
  repoRoot: string,
  branchPrefix = "agent-worktree",
  baseDir?: string,
): Promise<WorktreeHandle> {
  const branch = branchName(branchPrefix);
  const parent = baseDir ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const tmpDir = await mkdtemp(join(parent, "vanta-worktree-"));

  // Create the worktree on a new branch based on HEAD.
  await run("git", ["worktree", "add", "-b", branch, tmpDir, "HEAD"], { cwd: repoRoot });

  const cleanup = () => cleanupWorktree(repoRoot, tmpDir, branch);

  return { path: tmpDir, branch, cleanup };
}

export async function cleanupWorktree(repoRoot: string, path: string, branch: string): Promise<void> {
  try {
    await run("git", ["worktree", "remove", "--force", path], { cwd: repoRoot });
  } catch { /* already removed */ }
  try {
    await rm(path, { recursive: true, force: true });
  } catch { /* already gone */ }
  try {
    await run("git", ["branch", "-D", branch], { cwd: repoRoot });
  } catch { /* branch may have been merged */ }
}

/**
 * Check if a worktree branch has uncommitted changes or commits ahead of HEAD.
 * Returns a summary of the diff.
 */
export async function worktreeDiff(repoRoot: string, branch: string): Promise<string> {
  try {
    const { stdout } = await run("git", ["diff", `HEAD..${branch}`, "--stat"], { cwd: repoRoot });
    return stdout.trim() || "(no changes)";
  } catch {
    return "(diff unavailable)";
  }
}

/**
 * Merge a worktree branch back into the current branch (no-ff).
 * Returns true on success, false on conflict.
 */
export async function mergeWorktreeBranch(
  repoRoot: string,
  branch: string,
  commitMessage: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await run("git", ["merge", "--no-ff", branch, "-m", commitMessage], { cwd: repoRoot });
    return { ok: true, message: `merged ${branch}` };
  } catch (err) {
    return { ok: false, message: `merge conflict: ${(err as Error).message.split("\n")[0]}` };
  }
}
