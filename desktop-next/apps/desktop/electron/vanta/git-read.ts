import { type GitContext, DIFF_FLAGS, repoDir, safeRef, sumUntracked } from "./git-common";
import { type ParsedStatus, parseNumstat, parseStatus, type StatusEntry } from "./git-parse";
import { isSecretPath } from "./project-guard";

export type { GitContext } from "./git-common";
export const REVIEW_FILE_CAP = 2000;
export const STATUS_FILE_CAP = 200;
const UNTRACKED_COUNT_FILES = 500;
const TRUNK_CANDIDATES = ["origin/main", "origin/master", "main", "master"];

/** Where Vanta puts extra worktrees. They are separate checkouts, not changes to this one. */
const WORKTREE_DIR = ".worktrees";

export const isWorktreePath = (rel: string): boolean => rel === WORKTREE_DIR || rel.startsWith(`${WORKTREE_DIR}/`);

export async function statusOf(ctx: GitContext, cwd: string): Promise<null | ParsedStatus> {
  const result = await ctx.git.run(cwd, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]);

  if (result.ok === false) {
    return null;
  }

  const parsed = parseStatus(result.stdout);

  return { ...parsed, entries: parsed.entries.filter(item => !isSecretPath(item.path) && !isWorktreePath(item.path)) };
}

async function numstat(ctx: GitContext, cwd: string, refs: string[]): Promise<Map<string, { added: number; removed: number }>> {
  const result = await ctx.git.run(cwd, ["diff", "--numstat", "-z", ...DIFF_FLAGS, ...refs]);
  const counts = new Map<string, { added: number; removed: number }>();

  if (result.ok) {
    for (const row of parseNumstat(result.stdout)) {
      counts.set(row.path, { added: row.added, removed: row.removed });
    }
  }

  return counts;
}

/** The repository's trunk name ("main"), preferring origin/HEAD, then a local or remote main/master. */
export async function defaultBranchName(ctx: GitContext, cwd: string): Promise<null | string> {
  const head = await ctx.git.run(cwd, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const name = head.ok ? head.stdout.trim() : "";

  if (name && name !== "origin/HEAD") {
    return name.replace(/^origin\//, "");
  }

  for (const ref of ["refs/heads/main", "refs/heads/master", "refs/remotes/origin/main", "refs/remotes/origin/master"]) {
    const found = await ctx.git.run(cwd, ["rev-parse", "--verify", "--quiet", ref]);

    if (found.ok) {
      return ref.replace(/^refs\/(?:heads|remotes\/origin)\//, "");
    }
  }

  return null;
}

const isStaged = (item: StatusEntry): boolean => !item.untracked && item.index !== ".";
const isUnstaged = (item: StatusEntry): boolean => !item.untracked && item.worktree !== ".";

export async function repoStatus(ctx: GitContext, raw: unknown) {
  const cwd = await repoDir(ctx, raw);
  const status = cwd ? await statusOf(ctx, cwd) : null;

  if (!cwd || !status) {
    return null;
  }

  const files = status.entries.map(item => ({
    conflicted: item.conflicted,
    path: item.path,
    staged: isStaged(item),
    unstaged: isUnstaged(item),
    untracked: item.untracked
  }));

  const counts = await numstat(ctx, cwd, ["HEAD"]);
  const untrackedPaths = files.filter(file => file.untracked).map(file => file.path).slice(0, UNTRACKED_COUNT_FILES);
  const fromUntracked = (await sumUntracked(ctx, cwd, untrackedPaths)).reduce((sum, count) => sum + count, 0);
  const tracked = [...counts.values()];

  return {
    added: tracked.reduce((sum, row) => sum + row.added, 0) + fromUntracked,
    ahead: status.ahead,
    behind: status.behind,
    branch: status.branch,
    changed: files.length,
    conflicted: files.filter(file => file.conflicted).length,
    defaultBranch: await defaultBranchName(ctx, cwd),
    detached: status.detached,
    files: files.slice(0, STATUS_FILE_CAP),
    removed: tracked.reduce((sum, row) => sum + row.removed, 0),
    staged: files.filter(file => file.staged).length,
    unstaged: files.filter(file => file.unstaged).length,
    untracked: files.filter(file => file.untracked).length
  };
}

export async function branchBase(ctx: GitContext, cwd: string): Promise<null | string> {
  const head = await ctx.git.run(cwd, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const remoteDefault = head.ok ? head.stdout.trim() : "";
  const candidates = [remoteDefault && remoteDefault !== "origin/HEAD" ? remoteDefault : "", ...TRUNK_CANDIDATES].filter(Boolean);

  for (const ref of candidates) {
    const base = safeRef(ref) ? await ctx.git.run(cwd, ["merge-base", "HEAD", ref]) : null;

    if (base?.ok && base.stdout.trim()) {
      return base.stdout.trim();
    }
  }

  return null;
}

function statusLetter(item: StatusEntry): string {
  if (item.untracked) {
    return "?";
  }

  if (item.conflicted) {
    return "U";
  }

  const code = item.index !== "." ? item.index : item.worktree;

  return code === "T" ? "M" : code;
}

async function uncommittedList(ctx: GitContext, cwd: string) {
  const status = await statusOf(ctx, cwd);
  const [staged, unstaged] = await Promise.all([numstat(ctx, cwd, ["--cached"]), numstat(ctx, cwd, [])]);

  const files = (status?.entries ?? []).slice(0, REVIEW_FILE_CAP).map(item => {
    const a = staged.get(item.path);
    const b = unstaged.get(item.path);

    return {
      added: (a?.added ?? 0) + (b?.added ?? 0),
      path: item.path,
      removed: (a?.removed ?? 0) + (b?.removed ?? 0),
      staged: isStaged(item),
      status: statusLetter(item)
    };
  });

  return fillUntracked(ctx, cwd, files);
}

async function fillUntracked<T extends { added: number; status: string; path: string }>(ctx: GitContext, cwd: string, files: T[]): Promise<T[]> {
  const pending = files.filter(file => file.status === "?");
  const counts = await sumUntracked(ctx, cwd, pending.map(file => file.path));
  pending.forEach((file, index) => {
    file.added = counts[index] ?? 0;
  });

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function rangeList(ctx: GitContext, cwd: string, refs: string[], withUntracked: boolean) {
  const rows = await numstat(ctx, cwd, refs);
  const files = [...rows.entries()]
    .filter(([file]) => !isSecretPath(file))
    .slice(0, REVIEW_FILE_CAP)
    .map(([file, count]) => ({ added: count.added, path: file, removed: count.removed, staged: false, status: "M" }));

  if (withUntracked) {
    const known = new Set(files.map(file => file.path));
    const extra = ((await statusOf(ctx, cwd))?.entries ?? []).filter(item => item.untracked && !known.has(item.path));
    files.push(...extra.slice(0, REVIEW_FILE_CAP - files.length).map(item => ({ added: 0, path: item.path, removed: 0, staged: false, status: "?" })));
  }

  return fillUntracked(ctx, cwd, files);
}

export async function reviewList(ctx: GitContext, raw: unknown, scope: unknown, baseRef: unknown) {
  const empty = { base: null, files: [] };
  const cwd = await repoDir(ctx, raw);

  if (!cwd) {
    return empty;
  }

  if (scope === "branch") {
    const base = await branchBase(ctx, cwd);

    return base ? { base, files: await rangeList(ctx, cwd, [base, "HEAD"], false) } : empty;
  }

  if (scope === "lastTurn") {
    const base = safeRef(baseRef);

    return base ? { base, files: await rangeList(ctx, cwd, [base], true) } : empty;
  }

  return { base: null, files: await uncommittedList(ctx, cwd) };
}

