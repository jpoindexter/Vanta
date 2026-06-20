import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enterWorktreeTool, exitWorktreeTool } from "./worktree.js";
import type { ToolContext } from "./types.js";

const run = promisify(execFile);

let root: string;

function ctx(): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

/** Stand up a throwaway git repo with one commit so worktrees have a HEAD. */
async function initRepo(dir: string): Promise<void> {
  await run("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "test@vanta.local"], { cwd: dir });
  await run("git", ["config", "user.name", "Vanta Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# temp\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-q", "-m", "init"], { cwd: dir });
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  const { code } = await run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: repo,
  }).then(
    () => ({ code: 0 }),
    () => ({ code: 1 }),
  );
  return code === 0;
}

/** Pull `path` and `branch` out of enter_worktree's human-readable output. */
function parseHandle(output: string): { path: string; branch: string } {
  const path = /path:\s+(\S+)/.exec(output)?.[1] ?? "";
  const branch = /branch:\s+(\S+)/.exec(output)?.[1] ?? "";
  return { path, branch };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-wt-test-"));
  await initRepo(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("enter_worktree", () => {
  it("creates an isolated worktree on its own branch (dir + branch exist)", async () => {
    const res = await enterWorktreeTool.execute({}, ctx());
    expect(res.ok).toBe(true);
    const { path, branch } = parseHandle(res.output);
    expect(path).not.toBe("");
    expect(branch).toMatch(/^agent-worktree\//);
    expect(await dirExists(path)).toBe(true);
    expect(await branchExists(root, branch)).toBe(true);
    // Lives inside the repo's .vanta/worktrees (kernel-scoped), not the OS tmp root.
    expect(path).toContain(join(".vanta", "worktrees"));
  });

  it("honors a custom branch_prefix", async () => {
    const res = await enterWorktreeTool.execute({ branch_prefix: "spike" }, ctx());
    expect(res.ok).toBe(true);
    expect(parseHandle(res.output).branch).toMatch(/^spike\//);
  });
});

describe("exit_worktree", () => {
  it("auto-cleans an UNCHANGED worktree (dir + branch gone)", async () => {
    const entered = await enterWorktreeTool.execute({}, ctx());
    const { path, branch } = parseHandle(entered.output);

    const res = await exitWorktreeTool.execute({ path, branch }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Exited worktree");
    expect(await dirExists(path)).toBe(false);
    expect(await branchExists(root, branch)).toBe(false);
  });

  it("refuses a DIRTY worktree and surfaces the changes (does NOT delete)", async () => {
    const entered = await enterWorktreeTool.execute({}, ctx());
    const { path, branch } = parseHandle(entered.output);
    // Introduce an uncommitted change in the worktree.
    await writeFile(join(path, "scratch.txt"), "work in progress\n");

    const res = await exitWorktreeTool.execute({ path, branch }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("uncommitted changes");
    expect(res.output).toContain("scratch.txt");
    // The whole point: nothing was discarded.
    expect(await dirExists(path)).toBe(true);
    expect(await branchExists(root, branch)).toBe(true);

    // Clean up the throwaway worktree so afterEach's rm doesn't trip on git metadata.
    await exitWorktreeTool.execute({ path, branch, force: true }, ctx());
  });

  it("force:true removes a DIRTY worktree (discards changes)", async () => {
    const entered = await enterWorktreeTool.execute({}, ctx());
    const { path, branch } = parseHandle(entered.output);
    await writeFile(join(path, "scratch.txt"), "throwaway\n");

    const res = await exitWorktreeTool.execute({ path, branch, force: true }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("forced");
    expect(await dirExists(path)).toBe(false);
    expect(await branchExists(root, branch)).toBe(false);
  });
});
