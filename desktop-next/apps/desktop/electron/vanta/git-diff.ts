import { DIFF_FLAGS, type GitContext, repoDir, safeRef, safeRelativeFile, untrackedText } from "./git-common";
import { allAddedDiff } from "./git-parse";
import { branchBase } from "./git-read";

export const DIFF_OUTPUT_CAP = 1024 * 1024;

async function isUntracked(ctx: GitContext, cwd: string, file: string): Promise<boolean> {
  const listed = await ctx.git.run(cwd, ["ls-files", "-z", "--others", "--exclude-standard", "--", file]);

  return listed.ok && listed.stdout.split("\0").includes(file);
}

async function addedDiff(ctx: GitContext, cwd: string, file: string): Promise<string> {
  const text = await untrackedText(ctx, cwd, file);

  return text === null ? `Binary or very large new file: ${file}\n` : allAddedDiff(file, text);
}

async function diffText(ctx: GitContext, cwd: string, refs: string[], file: string): Promise<string> {
  const result = await ctx.git.run(cwd, ["diff", ...DIFF_FLAGS, ...refs, "--", file]);

  if (result.ok === false) {
    return "";
  }

  return result.stdout.length > DIFF_OUTPUT_CAP
    ? `${result.stdout.slice(0, DIFF_OUTPUT_CAP)}\n# diff truncated\n`
    : result.stdout + (result.truncated ? "\n# diff truncated\n" : "");
}

interface DiffOptions {
  baseRef?: unknown;
  scope?: unknown;
  staged?: unknown;
}

async function lastTurnDiff(ctx: GitContext, cwd: string, file: string, baseRef: unknown): Promise<string> {
  const base = safeRef(baseRef);

  if (!base) {
    return "";
  }

  return (await diffText(ctx, cwd, [base], file)) || ((await isUntracked(ctx, cwd, file)) ? addedDiff(ctx, cwd, file) : "");
}

async function uncommittedDiff(ctx: GitContext, cwd: string, file: string, staged: unknown): Promise<string> {
  if (staged === true) {
    return diffText(ctx, cwd, ["--cached"], file);
  }

  return (await diffText(ctx, cwd, [], file)) || ((await isUntracked(ctx, cwd, file)) ? addedDiff(ctx, cwd, file) : "");
}

export async function reviewDiff(ctx: GitContext, raw: unknown, rawFile: unknown, options: DiffOptions): Promise<string> {
  const cwd = await repoDir(ctx, raw);
  const file = safeRelativeFile(rawFile);

  if (!cwd || !file) {
    return "";
  }

  if (options.scope === "branch") {
    const base = await branchBase(ctx, cwd);

    return base ? diffText(ctx, cwd, [base, "HEAD"], file) : "";
  }

  return options.scope === "lastTurn" ? lastTurnDiff(ctx, cwd, file, options.baseRef) : uncommittedDiff(ctx, cwd, file, options.staged);
}

/** Working tree against HEAD for one file; empty for a clean tracked file, an all-added diff for an untracked one. */
export async function fileDiff(ctx: GitContext, raw: unknown, rawFile: unknown): Promise<string> {
  const cwd = await repoDir(ctx, raw);
  const file = safeRelativeFile(rawFile);

  if (!cwd || !file) {
    return "";
  }

  const changes = await diffText(ctx, cwd, ["HEAD"], file);

  return changes || ((await isUntracked(ctx, cwd, file)) ? addedDiff(ctx, cwd, file) : "");
}

export async function revParse(ctx: GitContext, raw: unknown, ref: unknown): Promise<null | string> {
  const cwd = await repoDir(ctx, raw);
  const target = ref === undefined || ref === null || ref === "" ? "HEAD" : safeRef(ref);

  if (!cwd || !target) {
    return null;
  }

  const result = await ctx.git.run(cwd, ["rev-parse", "--verify", "--quiet", `${target}^{commit}`]);

  return result.ok ? result.stdout.trim() || null : null;
}
