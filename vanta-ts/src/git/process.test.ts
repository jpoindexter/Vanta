import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitExecFile, gitExecFileSync } from "./process.js";
import { hostileGitFixture } from "./hostile-fixture.js";
import { directGitArgs } from "./shell.js";
import { gitBranchTool, gitCheckoutTool, gitCommitTool, gitDiffTool, gitPushTool, gitStatusTool } from "../tools/git.js";
import { gitLineDelta } from "../ui/status-git.js";
import { listChangedFiles, fileDiff } from "../repl/changed-files.js";
import { checkCondition } from "../repl/goal-condition.js";
import type { ToolContext } from "../tools/types.js";
import { shellCmdTool } from "../tools/shell-cmd.js";

const missing = async (path: string) => access(path).then(() => false, () => true);

describe("Git repository execution isolation", () => {
  it("reproduces the unprotected fsmonitor sink, then isolates actual Vanta probes and approval-denied writes", async () => {
    const f = await hostileGitFixture();
    try {
      await f.git(["status", "--short"]);
      expect(await missing(f.marker)).toBe(false);
      await unlink(f.marker);
      const ctx = { root: f.repo, requestApproval: async () => false } as unknown as ToolContext;
      expect((await gitStatusTool.execute({}, ctx)).ok).toBe(true);
      expect((await gitDiffTool.execute({}, ctx)).output).toContain("after");
      for (const [tool, args] of [[gitCommitTool, { message: "denied" }], [gitCheckoutTool, { ref: "main" }], [gitBranchTool, { name: "denied" }], [gitPushTool, {}]] as const) {
        expect((await tool.execute(args, ctx)).output).toBe("denied");
      }
      for (const args of [["show", "HEAD:file.txt"], ["log", "-1", "--patch"], ["blame", "file.txt"], ["branch", "--list"], ["worktree", "list"]]) {
        expect((await gitExecFile("git", args, { cwd: f.repo })).stdout).not.toBe("");
      }
      expect(await gitLineDelta(f.repo)).toEqual({ added: 1, removed: 1 });
      expect((await listChangedFiles(f.repo)).length).toBe(2);
      expect(await fileDiff(f.repo, "file.txt")).toContain("after");
      expect(await checkCondition("git status --short", f.repo)).toBe(true);
      expect((await shellCmdTool.execute({ command: "git status --short" }, ctx)).output).not.toContain("repository sink");
      expect(await missing(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it("approved local commit, checkout, worktree and push retain ordinary behavior without filters or either repository's hooks", async () => {
    const f = await hostileGitFixture();
    try {
      const ctx = { root: f.repo, requestApproval: async () => true } as unknown as ToolContext;
      expect((await gitCommitTool.execute({ message: "approved exact fixture" }, ctx)).ok).toBe(true);
      expect((await gitBranchTool.execute({ name: "fixture-branch" }, ctx)).ok).toBe(true);
      expect((await gitCheckoutTool.execute({ ref: "fixture-branch" }, ctx)).ok).toBe(true);
      const worktree = join(f.root, "worktree");
      await gitExecFile("git", ["worktree", "add", "--detach", worktree], { cwd: f.repo });
      expect(await readFile(join(worktree, "file.txt"), "utf8")).toBe("after\n");
      const remote = join(f.root, "remote.git");
      await f.git(["init", "-q", "--bare", remote]);
      await f.git(["config", "core.hooksPath", f.hooks], remote);
      await f.git(["remote", "add", "origin", remote]);
      expect((await gitPushTool.execute({ remote: "origin", branch: "fixture-branch" }, ctx)).ok).toBe(true);
      expect(gitExecFileSync("git", ["rev-parse", "fixture-branch"], { cwd: remote })).toMatch(/^[a-f0-9]{40}\s*$/);
      expect(await missing(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it("rejects aliases, config override flags, hostile remote transport and output-file injection", async () => {
    const f = await hostileGitFixture();
    try {
      await f.git(["config", "alias.pwn", `!${f.script}`]);
      await f.git(["remote", "add", "origin", `ext::${f.script}`]);
      for (const args of [["pwn"], ["-c", `core.fsmonitor=${f.script}`, "status"], ["diff", `--output=${f.marker}`], ["push", "origin", "main"]]) {
        await expect(gitExecFile("git", args, { cwd: f.repo })).rejects.toThrow();
      }
      await f.git(["config", "http.sslCert", f.script]);
      await expect(gitExecFile("git", ["ls-remote", "https://example.invalid/repo.git"], { cwd: f.repo })).rejects.toThrow("separate explicit authority");
      const global = join(f.root, "global-config");
      await writeFile(global, `[core]\nfsmonitor = ${f.script}\n`);
      await gitExecFile("git", ["status", "--short"], { cwd: f.repo, env: { ...process.env, GIT_CONFIG_GLOBAL: global, GIT_EXTERNAL_DIFF: f.script } });
      expect(await missing(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it("direct shell Git never evaluates expansions or compound commands", () => {
    expect(directGitArgs("git commit -m 'literal test text'")).toEqual(["commit", "-m", "literal test text"]);
    expect(() => directGitArgs("git status; touch marker")).toThrow();
    expect(() => directGitArgs("echo hello | git status")).toThrow();
    expect(directGitArgs("printf hello")).toBeNull();
    expect(directGitArgs("echo 'git status'")).toBeNull();
  });

  it("fails closed when repository configuration cannot be read", async () => {
    const f = await hostileGitFixture();
    try {
      await writeFile(join(f.repo, ".git", "config"), "[unterminated\n");
      await expect(gitExecFile("git", ["add", "-A"], { cwd: f.repo })).rejects.toThrow();
      expect(await missing(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });
});
