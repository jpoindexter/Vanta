import { runGit } from "../tools/git.js";
import type { LineDelta } from "./status-segments.js";

// Data sources for the rich status line: working-tree line delta vs HEAD and
// linked-worktree detection. Both go through the existing runGit (errors-as-
// values) and degrade to safe defaults — the status line never throws.

/** Pure: sum added/removed across `git diff --numstat` output. Binary rows ("-") count 0. */
export function parseNumstatTotals(out: string): LineDelta {
  let added = 0;
  let removed = 0;
  for (const line of out.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const a = parts[0] === "-" ? 0 : parseInt(parts[0]!, 10);
    const r = parts[1] === "-" ? 0 : parseInt(parts[1]!, 10);
    if (!Number.isNaN(a)) added += a;
    if (!Number.isNaN(r)) removed += r;
  }
  return { added, removed };
}

/**
 * Pure: a linked worktree has its own gitdir under `<common>/worktrees/<name>`,
 * so the per-worktree git-dir differs from the shared git-common-dir.
 */
export function isLinkedWorktree(gitDir: string, commonDir: string): boolean {
  const norm = (p: string): string => p.replace(/\/+$/, "");
  return norm(gitDir) !== norm(commonDir) && norm(gitDir).includes("/worktrees/");
}

/** Session line delta vs HEAD. Returns {0,0} outside a repo or on any git error. */
export async function gitLineDelta(root: string): Promise<LineDelta> {
  const { code, out } = await runGit(["diff", "--numstat", "HEAD"], root);
  if (code !== 0) return { added: 0, removed: 0 };
  return parseNumstatTotals(out);
}

/** True when `root` is inside a linked git worktree. False outside a repo. */
export async function gitIsWorktree(root: string): Promise<boolean> {
  const [dir, common] = await Promise.all([
    runGit(["rev-parse", "--absolute-git-dir"], root),
    runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], root),
  ]);
  if (dir.code !== 0 || common.code !== 0) return false;
  return isLinkedWorktree(dir.out.trim(), common.out.trim());
}
