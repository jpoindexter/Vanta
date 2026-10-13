import path from "node:path";

import { gitRoot } from "./fs-read";
import { type GitContext, repoDir } from "./git-common";
import { defaultBranchName } from "./git-read";
import { type BranchRow, parseBranches, parseWorktrees } from "./git-parse";

const BRANCH_FORMAT = "--format=%(refname)%09%(HEAD)%09%(worktreepath)";

async function branchRows(ctx: GitContext, cwd: string): Promise<BranchRow[]> {
  const result = await ctx.git.run(cwd, ["branch", "--list", "--all", BRANCH_FORMAT]);

  return result.ok ? parseBranches(result.stdout) : [];
}

/** Local branches, then the remote-tracking branches that have no local twin ("convert a branch into a worktree"). */
export async function branchList(ctx: GitContext, raw: unknown) {
  const cwd = await repoDir(ctx, raw);

  if (!cwd) {
    return [];
  }

  const [rows, trunk] = await Promise.all([branchRows(ctx, cwd), defaultBranchName(ctx, cwd)]);
  const localNames = new Set(rows.filter(row => !row.remote).map(row => row.name));

  const local = rows
    .filter(row => !row.remote)
    .map(row => ({
      checkedOut: row.checkedOut,
      isDefault: row.name === trunk,
      isRemote: false,
      name: row.name,
      worktreePath: row.worktreePath
    }));

  const remote = rows
    .filter(row => row.remote && !localNames.has(row.name.replace(/^[^/]+\//, "")))
    .map(row => ({ checkedOut: false, isDefault: false, isRemote: true, name: row.name, worktreePath: null }));

  return [...local, ...remote];
}

/** Branches a new worktree could start from: local heads plus remote-tracking refs, the remote default flagged. */
export async function baseBranchList(ctx: GitContext, raw: unknown) {
  const cwd = await repoDir(ctx, raw);

  if (!cwd) {
    return [];
  }

  const [rows, trunk] = await Promise.all([branchRows(ctx, cwd), defaultBranchName(ctx, cwd)]);

  return rows.map(row => ({
    isDefault: row.remote ? row.name === `origin/${trunk}` : row.name === trunk && !rows.some(other => other.remote && other.name === `origin/${trunk}`),
    isRemote: row.remote,
    name: row.name
  }));
}

/** Checkouts of this repository that live inside the project; a worktree elsewhere on disk is not readable here. */
export async function worktreeList(ctx: GitContext, raw: unknown) {
  const cwd = await repoDir(ctx, raw);
  const root = await ctx.guard.rootReal();

  if (!cwd || !root) {
    return [];
  }

  const result = await ctx.git.run(cwd, ["worktree", "list", "--porcelain"]);
  const inside = (target: string) => target === root || target.startsWith(`${root}${path.sep}`);

  return result.ok ? parseWorktrees(result.stdout).filter(row => inside(row.path)) : [];
}

/** The renderer's repo scan is limited to the project itself: roots it names are ignored, never crawled. */
export async function scanRepos(ctx: GitContext) {
  const root = await ctx.guard.rootReal();
  const found = root ? await gitRoot(ctx.guard, root) : null;

  return found ? [{ label: path.basename(found), root: found }] : [];
}
