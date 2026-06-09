import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";

const execAsync = promisify(execFile);

/** Returns the git remote URL for origin, null if not a git repo or no remote. */
export async function getGitRemoteUrl(root: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git", ["-C", root, "remote", "get-url", "origin"], { timeout: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Detects if `root` is inside a git worktree (`.git` is a file, not a dir).
 * In that case, resolves to the main repository root so memories, goals, and
 * identity are shared across worktrees of the same project.
 */
export async function resolveMainRepoRoot(root: string): Promise<string> {
  try {
    const gitPath = `${root}/.git`;
    const stat = statSync(gitPath);
    if (stat.isDirectory()) return root; // main repo
    // Worktree: .git is a file pointing to the shared git dir. Use git to find it.
    const { stdout } = await execAsync("git", ["-C", root, "rev-parse", "--git-common-dir"], { timeout: 5_000 });
    const commonDir = stdout.trim();
    // commonDir is absolute (e.g. /repo/.git) in a worktree, relative in main.
    if (commonDir.startsWith("/")) return dirname(commonDir);
    return root;
  } catch {
    return root;
  }
}

/**
 * Returns a stable canonical project ID:
 * - SHA-256 of the normalized git remote URL (first 12 hex chars) when available
 * - Falls back to the directory basename of the main repo root.
 *
 * Stable across machines, clones, and worktrees of the same project.
 */
export async function canonicalProjectId(root: string): Promise<string> {
  const mainRoot = await resolveMainRepoRoot(root);
  const remote = await getGitRemoteUrl(mainRoot);
  if (remote) {
    const normalized = remote.replace(/\.git$/, "").toLowerCase().trim();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  }
  return basename(mainRoot);
}
