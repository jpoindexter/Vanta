import path from "node:path";

import { z } from "zod";

import { type GitContext, repoDir, safeRef, safeRelativeFile } from "./git-common";
import { statusOf } from "./git-read";

export const MAX_MESSAGE = 5000;
export const FILES_PER_COMMAND = 40;
export const MAX_FILES = 400;

const repo = z.string().min(1).max(4096);
const file = z.string().min(1).max(4096).nullable();

/** The repository changes the Changes pane and branch picker can ask for. Every one is run through the approval flow. */
export const mutationRequest = z.discriminatedUnion("op", [
  z.object({ file, op: z.literal("stage"), repo }),
  z.object({ file, op: z.literal("unstage"), repo }),
  z.object({ file, op: z.literal("revert"), repo }),
  z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE), op: z.literal("commit"), push: z.boolean(), repo }),
  z.object({ op: z.literal("push"), repo }),
  z.object({ branch: z.string().max(200), op: z.literal("branchSwitch"), repo })
]);

export type MutationRequest = z.infer<typeof mutationRequest>;

export type Plan = { commands: string[]; ok: true } | { message: string; ok: false };

const refuse = (message: string): Plan => ({ message, ok: false });

/** POSIX single-quote escaping, so a file name or message is one literal argument and never shell syntax. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

interface Target {
  /** `git` or `git -C <folder>` when the repository is a folder inside the project. */
  git: string;
  cwd: string;
}

async function targetFor(ctx: GitContext, raw: string): Promise<null | Target> {
  const cwd = await repoDir(ctx, raw);
  const root = await ctx.guard.rootReal();

  if (!cwd || !root) {
    return null;
  }

  const relative = path.relative(root, cwd);

  return { cwd, git: relative ? `git -C ${shellQuote(relative)}` : "git" };
}

function pathsCommand(git: string, verb: string, files: string[]): string[] {
  return chunk(files, FILES_PER_COMMAND).map(group => `${git} ${verb} -- ${group.map(shellQuote).join(" ")}`);
}

/** Changed files, secrets already left out, split into tracked and untracked. */
async function changedFiles(ctx: GitContext, cwd: string) {
  const status = await statusOf(ctx, cwd);
  const entries = status?.entries ?? [];

  return {
    hasUpstream: status?.hasUpstream ?? false,
    branch: status?.branch ?? null,
    staged: entries.filter(entry => !entry.untracked && entry.index !== ".").map(entry => entry.path),
    tracked: entries.filter(entry => !entry.untracked).map(entry => entry.path).slice(0, MAX_FILES),
    untracked: entries.filter(entry => entry.untracked).map(entry => entry.path).slice(0, MAX_FILES),
    everything: entries.map(entry => entry.path).slice(0, MAX_FILES)
  };
}

async function stagePlan(ctx: GitContext, target: Target, rawFile: null | string): Promise<Plan> {
  if (rawFile !== null) {
    const name = safeRelativeFile(rawFile);

    return name ? { commands: pathsCommand(target.git, "add", [name]), ok: true } : refuse("That file can hold secrets, so Vanta will not stage it.");
  }

  const { everything } = await changedFiles(ctx, target.cwd);

  return everything.length ? { commands: pathsCommand(target.git, "add", everything), ok: true } : refuse("There is nothing to stage.");
}

async function unstagePlan(target: Target, rawFile: null | string): Promise<Plan> {
  const name = rawFile === null ? null : safeRelativeFile(rawFile);

  if (rawFile !== null && !name) {
    return refuse("That file can hold secrets, so Vanta will not touch it.");
  }

  return { commands: [name ? `${target.git} reset -q -- ${shellQuote(name)}` : `${target.git} reset -q`], ok: true };
}

async function revertPlan(ctx: GitContext, target: Target, rawFile: null | string): Promise<Plan> {
  const changes = await changedFiles(ctx, target.cwd);
  const name = rawFile === null ? null : safeRelativeFile(rawFile);

  if (rawFile !== null && !name) {
    return refuse("That file can hold secrets, so Vanta will not touch it.");
  }

  const tracked = name ? changes.tracked.filter(entry => entry === name) : changes.tracked;
  const untracked = name ? changes.untracked.filter(entry => entry === name) : changes.untracked;
  const commands = [
    ...pathsCommand(target.git, "restore --source=HEAD --staged --worktree", tracked),
    ...pathsCommand(target.git, "clean -f", untracked)
  ];

  return commands.length ? { commands, ok: true } : refuse("There is nothing to revert.");
}

const pushCommand = (git: string, branch: null | string, hasUpstream: boolean): null | string => {
  if (hasUpstream) {
    return `${git} push`;
  }

  return branch && safeRef(branch) ? `${git} push -u origin ${shellQuote(branch)}` : null;
};

async function commitPlan(ctx: GitContext, target: Target, message: string, push: boolean): Promise<Plan> {
  const changes = await changedFiles(ctx, target.cwd);
  const stageAll = changes.staged.length === 0 ? pathsCommand(target.git, "add", changes.everything) : [];

  if (changes.staged.length === 0 && changes.everything.length === 0) {
    return refuse("There is nothing to commit.");
  }

  const pushing = push ? pushCommand(target.git, changes.branch, changes.hasUpstream) : null;

  if (push && !pushing) {
    return refuse("Vanta could not tell which branch to push. Switch to a branch first.");
  }

  return { commands: [...stageAll, `${target.git} commit -m ${shellQuote(message)}`, ...(pushing ? [pushing] : [])], ok: true };
}

async function pushPlan(ctx: GitContext, target: Target): Promise<Plan> {
  const { branch, hasUpstream } = await changedFiles(ctx, target.cwd);
  const command = pushCommand(target.git, branch, hasUpstream);

  return command ? { commands: [command], ok: true } : refuse("Vanta could not tell which branch to push. Switch to a branch first.");
}

async function switchPlan(ctx: GitContext, target: Target, raw: string): Promise<Plan> {
  const branch = safeRef(raw);

  if (!branch || branch.includes("..") || branch.includes("{")) {
    return refuse("That is not a branch name Vanta can switch to.");
  }

  const local = await ctx.git.run(target.cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);

  return { commands: [`${target.git} switch ${local.ok ? "" : "--track "}${shellQuote(branch)}`], ok: true };
}

/** The exact shell commands for a requested change. Each is run, one at a time, through the approval flow. */
export async function planMutation(ctx: GitContext, request: MutationRequest): Promise<Plan> {
  const target = await targetFor(ctx, request.repo);

  if (!target) {
    return refuse("That folder is not a Git repository inside this project.");
  }

  switch (request.op) {
    case "stage":
      return stagePlan(ctx, target, request.file);
    case "unstage":
      return unstagePlan(target, request.file);
    case "revert":
      return revertPlan(ctx, target, request.file);
    case "commit":
      return commitPlan(ctx, target, request.message, request.push);
    case "push":
      return pushPlan(ctx, target);
    case "branchSwitch":
      return switchPlan(ctx, target, request.branch);
  }
}
