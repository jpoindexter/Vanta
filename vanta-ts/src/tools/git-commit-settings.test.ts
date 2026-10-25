import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { gitExecFile } from "../git/process.js";
import type { SafetyClient } from "../safety-client.js";
import { gitCommitTool } from "./git.js";
import type { ToolContext } from "./types.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-git-policy-"));
  roots.push(root);
  const repo = join(root, "repo");
  const home = join(root, "home");
  await mkdir(join(repo, ".vanta"), { recursive: true });
  await mkdir(home);
  vi.stubEnv("VANTA_HOME", home);
  const git = async (...args: string[]) => (await gitExecFile("git", args, { cwd: repo })).stdout;
  await git("init");
  await git("config", "user.name", "Policy Fixture");
  await git("config", "user.email", "policy@example.test");
  await writeFile(join(repo, "staged.txt"), "base");
  await writeFile(join(repo, "unstaged.txt"), "base");
  await git("add", "--", "staged.txt", "unstaged.txt");
  await git("commit", "-m", "fixture baseline");
  await writeFile(join(repo, "staged.txt"), "intentional staged change");
  await git("add", "--", "staged.txt");
  await writeFile(join(repo, "unstaged.txt"), "unstaged change");
  await writeFile(join(repo, "untracked.txt"), "untracked change");
  const approval = vi.fn(async () => true);
  const ctx: ToolContext = { root: repo, safety: {} as SafetyClient, requestApproval: approval };
  const snapshot = async () => ({
    status: await git("status", "--porcelain"),
    staged: await git("diff", "--cached", "--binary"),
    head: await git("rev-parse", "HEAD"),
    index: await readFile(join(repo, ".git", "index")),
  });
  return { repo, home, git, ctx, approval, snapshot };
}

it.each(["user", "project", "local"])("leaves index, staging and HEAD unchanged for invalid %s settings", async scope => {
  const f = await fixture();
  const settings = scope === "user" ? join(f.home, "settings.json")
    : join(f.repo, ".vanta", scope === "local" ? "settings.local.json" : "settings.json");
  await writeFile(settings, '{"blockedTools":');
  const before = await f.snapshot();
  await expect(gitCommitTool.execute({ message: "must not stage" }, f.ctx)).rejects.toThrow(/Settings need recovery/);
  expect(await f.snapshot()).toEqual(before);
  expect(f.approval).toHaveBeenCalledTimes(1);
  expect(await readFile(settings, "utf8")).toBe('{"blockedTools":');
});

it("does not stage when a recognized policy field has an invalid type", async () => {
  const f = await fixture();
  await writeFile(join(f.repo, ".vanta", "settings.json"), JSON.stringify({ blockedTools: "not-an-array" }));
  const before = await f.snapshot();
  await expect(gitCommitTool.execute({ message: "must not stage" }, f.ctx)).rejects.toThrow(/Settings need recovery/);
  expect(await f.snapshot()).toEqual(before);
});

it("still stages and commits after valid settings, retaining configured attribution", async () => {
  const f = await fixture();
  await writeFile(join(f.repo, ".vanta", "settings.json"), JSON.stringify({ attribution: "Co-Authored-By: Fixture <fixture@example.test>" }));
  const result = await gitCommitTool.execute({ message: "valid policy" }, f.ctx);
  expect(result.ok).toBe(true);
  expect(await f.git("log", "-1", "--pretty=%B")).toContain("Co-Authored-By: Fixture <fixture@example.test>");
  expect(await f.git("status", "--porcelain")).toBe("");
  expect(f.approval).toHaveBeenCalledTimes(1);
});
