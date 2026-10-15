import { promises as fsp } from "node:fs";
import path from "node:path";

import { gitRoot } from "./fs-read";
import { countLines } from "./git-parse";
import { type GitRunner, SAFE_REF } from "./git-runner";
import { isSecretPath, type ProjectGuard } from "./project-guard";

export interface GitContext {
  git: GitRunner;
  guard: ProjectGuard;
}

export const DIFF_FLAGS = ["--no-ext-diff", "--no-textconv", "--no-color", "-M"];
const UNTRACKED_COUNT_MAX_BYTES = 1024 * 1024;
const UNTRACKED_CONCURRENCY = 16;

/** The real folder of the repository that holds `raw`, or null when it is not a repository inside the project. */
export async function repoDir(ctx: GitContext, raw: unknown): Promise<null | string> {
  const root = await gitRoot(ctx.guard, raw);
  const resolved = root ? await ctx.guard.resolve(root, "dir") : null;

  return resolved?.ok ? resolved.value.real : null;
}

/** A repo-relative file name from the renderer: never absolute, never `..`, never a secret. */
export function safeRelativeFile(raw: unknown): null | string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096 || raw.includes("\0")) {
    return null;
  }

  const clean = raw.replace(/\\/g, "/");

  return path.isAbsolute(clean) || clean.split("/").includes("..") || isSecretPath(clean) ? null : clean;
}

export const safeRef = (raw: unknown): null | string => (typeof raw === "string" && SAFE_REF.test(raw) ? raw : null);

export async function untrackedText(ctx: GitContext, cwd: string, relative: string): Promise<null | string> {
  const target = await ctx.guard.resolve(path.join(cwd, relative), "file");

  if (target.ok === false || target.value.stat.size > UNTRACKED_COUNT_MAX_BYTES) {
    return null;
  }

  const bytes = await fsp.readFile(target.value.real).catch(() => null);

  return bytes && !bytes.includes(0) ? bytes.toString("utf8") : null;
}

async function untrackedLineCount(ctx: GitContext, cwd: string, relative: string): Promise<number> {
  const text = await untrackedText(ctx, cwd, relative);

  return text === null ? 0 : countLines(text);
}

export async function sumUntracked(ctx: GitContext, cwd: string, paths: string[]): Promise<number[]> {
  const counts: number[] = [];

  for (let start = 0; start < paths.length; start += UNTRACKED_CONCURRENCY) {
    const batch = paths.slice(start, start + UNTRACKED_CONCURRENCY);
    counts.push(...(await Promise.all(batch.map(file => untrackedLineCount(ctx, cwd, file)))));
  }

  return counts;
}

