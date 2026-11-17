import { promises as fsp } from "node:fs";
import path from "node:path";

import { worktreeList } from "./git-branches";
import type { GitContext } from "./git-common";
import { safeRef } from "./git-common";
import { type Plan, refuse, shellQuote, type Target } from "./git-plan-core";

const MAX_SLUG = 40;

export interface AddRequest {
  base?: string;
  branch?: string;
  existingBranch?: string;
  name?: string;
}

export interface RemoveRequest {
  force?: boolean;
  worktreePath: string;
}

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");

  return slug || "work";
}

export function sanitizeBranch(name: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^\w./-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-./]+|[-./]+$/g, "");
}

async function uniqueDir(base: string): Promise<string> {
  let dir = base;

  for (let attempt = 2; await fsp.lstat(dir).then(() => true, () => false); attempt += 1) {
    dir = `${base}-${attempt}`;
  }

  return dir;
}

async function branchExists(ctx: GitContext, target: Target, ref: string): Promise<boolean> {
  const found = await ctx.git.run(target.cwd, ["rev-parse", "--verify", "--quiet", ref]);

  return found.ok;
}

interface Added {
  branch: string;
  path: string;
  repoRoot: string;
}

function worktreePlan(command: string, created: Added): Plan {
  return { commands: [command], ok: true, result: created };
}

/** Check out a branch that already exists: a local one directly, a remote-only one as a new tracking branch. */
async function existingBranchPlan(ctx: GitContext, target: Target, existing: string, dir: string): Promise<Plan> {
  const place = `${target.git} worktree add`;
  const branch = existing.replace(/^origin\//, "");
  const local = await branchExists(ctx, target, `refs/heads/${existing}`);
  const command = local
    ? `${place} ${shellQuote(dir)} ${shellQuote(existing)}`
    : `${place} --track -b ${shellQuote(branch)} ${shellQuote(dir)} ${shellQuote(existing)}`;

  return worktreePlan(command, { branch, path: dir, repoRoot: target.cwd });
}

function newBranchPlan(target: Target, branch: string, dir: string, base: null | string): Plan {
  const track = base?.startsWith("origin/") ? " --no-track" : "";
  const from = base ? `${track} ${shellQuote(base)}` : "";

  return worktreePlan(`${target.git} worktree add -b ${shellQuote(branch)} ${shellQuote(dir)}${from}`, {
    branch,
    path: dir,
    repoRoot: target.cwd
  });
}

const validRef = (ref: string): boolean => Boolean(safeRef(ref)) && !ref.includes("{");

const BAD_BRANCH = "That is not a branch name Vanta can use.";

interface Names {
  base: null | string;
  branch: string;
  existing: string;
  slug: string;
}

/** The base ref, if one was asked for: null when none, undefined when it was not a plain ref. */
function baseRef(request: AddRequest): null | string | undefined {
  return request.base ? (safeRef(request.base) ?? undefined) : null;
}

/** The cleaned branch, base and folder names for a request, or null when any of them is not a plain ref. */
function namesFor(request: AddRequest): Names | null {
  const existing = sanitizeBranch(request.existingBranch ?? "");
  const slug = slugify(request.name || existing || `work-${Date.now().toString(36)}`);
  const branch = sanitizeBranch(request.branch ?? "") || `vanta/${slug}`;
  const base = baseRef(request);

  return base !== undefined && validRef(existing || branch) ? { base, branch, existing, slug } : null;
}

/** A new worktree under <repo>/.worktrees, on a new branch or on an existing one. Nothing is fetched. */
export async function addWorktreePlan(ctx: GitContext, target: Target, request: AddRequest): Promise<Plan> {
  const names = namesFor(request);

  if (!names) {
    return refuse(BAD_BRANCH);
  }

  const dir = await uniqueDir(path.join(target.cwd, ".worktrees", names.slug));

  return names.existing ? existingBranchPlan(ctx, target, names.existing, dir) : newBranchPlan(target, names.branch, dir, names.base);
}

/** Remove one of this repository's own worktrees inside the project; never the main checkout. */
export async function removeWorktreePlan(ctx: GitContext, target: Target, request: RemoveRequest): Promise<Plan> {
  const known = await worktreeList(ctx, target.cwd);
  const asked = path.resolve(request.worktreePath);
  const tree = known.find(entry => !entry.isMain && path.resolve(entry.path) === asked);

  if (!tree) {
    return refuse("That is not one of this project's extra worktrees, so Vanta will not remove it.");
  }

  const force = request.force ? " --force" : "";

  return { commands: [`${target.git} worktree remove${force} -- ${shellQuote(tree.path)}`], ok: true, result: { removed: tree.path } };
}
