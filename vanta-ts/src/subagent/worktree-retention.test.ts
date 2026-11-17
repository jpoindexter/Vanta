import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gitExecFile } from "../git/process.js";
import * as worktrees from "../worktree/manager.js";
import { startWorkerInspection } from "./worker-inspection.js";
import { listDelegationTrees } from "./delegation-receipt.js";
import type { AgentOutcome } from "../agent.js";
import type { ToolContext } from "../tools/types.js";

const injected = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock("./spawn.js", () => ({ spawnSubagent: injected.worker }));
vi.mock("../providers/index.js", () => ({ resolveProvider: () => ({ modelId: () => "synthetic-offline" }) }));
import { delegateTool } from "../tools/delegate.js";

let base: string, root: string;
let handle: worktrees.WorktreeHandle | undefined;
const realCreate = worktrees.createWorktree;
const git = (args: string[], cwd = root) => gitExecFile("git", args, { cwd });
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-retained-worktree-"));
  root = join(base, "project"); await mkdir(root);
  vi.stubEnv("VANTA_HOME", join(base, "home")); vi.stubEnv("HOME", base);
  vi.stubEnv("VANTA_MCP_AUTO_MOUNT", "0");
  await git(["init", "--initial-branch=main"]);
  await git(["config", "user.name", "Vanta isolated fixture"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(root, ".gitignore"), ".vanta/\n");
  await writeFile(join(root, "parent.txt"), "Parent work stays unchanged\n");
  await git(["add", ".gitignore", "parent.txt"]); await git(["commit", "-m", "Synthetic fixture baseline"]);
  vi.spyOn(worktrees, "createWorktree").mockImplementation(async (project, prefix) => {
    handle = await realCreate(project, prefix, join(base, "owned-worktrees")); return handle;
  });
});
afterEach(async () => {
  // Exact owned fixture only, after assertions: never clean an application worktree.
  await handle?.cleanup(); handle = undefined;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

it.each(["checkpoint-failure", "completed-clean-commit"])("retains real isolated %s work, branch and sidechain without changing the parent", async mode => {
  const parentHead = (await git(["rev-parse", "HEAD"])).stdout.trim();
  let childId = "";
  injected.worker.mockImplementation(async options => {
    childId = options.inspection.id;
    const inspection = await startWorkerInspection({ ...options.inspection, goal: "Synthetic work", instruction: "Owned fixture",
      model: "synthetic-offline", agentType: "fixture", declaredMaxIterations: 2 });
    await inspection.checkpoint([{ role: "user", content: "Owned fixture" }]);
    await writeFile(join(options.deps.root, "worker-only.txt"), "Preserve the worker's completed edit\n");
    const sidechain = join(options.deps.root, ".vanta", "sidechains", "fixture.json");
    await mkdir(join(options.deps.root, ".vanta", "sidechains"), { recursive: true });
    await writeFile(sidechain, "Synthetic raw sidechain\n");
    if (mode === "checkpoint-failure") {
      await writeFile(join(root, ".vanta", "sidechains", `worker-${childId}.json`), "{corrupt checkpoint}");
      await inspection.checkpoint([{ role: "assistant", content: "Partial work" }]);
      throw new Error("unreachable");
    }
    await git(["add", "worker-only.txt"], options.deps.root);
    await git(["commit", "-m", "Synthetic unmerged worker edit"], options.deps.root);
    expect((await git(["status", "--porcelain"], options.deps.root)).stdout.trim()).toBe("");
    return { finalText: "Synthetic completed work", iterations: 1, stoppedReason: "done", toolIterations: 1,
      workerEvidence: { rawSidechain: ".vanta/sidechains/fixture.json", tools: [], durationMs: 1, model: "synthetic-offline" } } satisfies AgentOutcome;
  });
  const progress: string[] = [];
  const result = await delegateTool.execute({ goal: "Synthetic work", instruction: "Owned fixture", isolation: "worktree" },
    { root, sessionId: "parent-fixture", safety: {}, requestApproval: async () => false, onProgress: (text: string) => progress.push(text) } as unknown as ToolContext);
  expect(handle).toBeDefined();
  expect(await readFile(join(handle!.path, "worker-only.txt"), "utf8")).toBe("Preserve the worker's completed edit\n");
  expect(await readFile(join(handle!.path, ".vanta", "sidechains", "fixture.json"), "utf8")).toBe("Synthetic raw sidechain\n");
  expect((await git(["show-ref", "--verify", `refs/heads/${handle!.branch}`])).stdout).toContain(handle!.branch);
  expect((await git(["worktree", "list", "--porcelain"])).stdout).toContain(await realpath(handle!.path));
  expect((await git(["rev-parse", "HEAD"])).stdout.trim()).toBe(parentHead);
  expect((await git(["status", "--porcelain"])).stdout.trim()).toBe("");
  expect(await readFile(join(root, "parent.txt"), "utf8")).toBe("Parent work stays unchanged\n");
  await expect(readFile(join(root, "worker-only.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(result.ok).toBe(mode === "completed-clean-commit");
  if (mode === "completed-clean-commit") {
    const receipt = (await listDelegationTrees(root))[0]!.nodes[0]!;
    expect(receipt.rawSidechain).toBe(join(handle!.path, ".vanta", "sidechains", "fixture.json"));
    expect(await readFile(receipt.rawSidechain, "utf8")).toBe("Synthetic raw sidechain\n");
  }
  if (mode === "checkpoint-failure") expect(result.effectDisposition).toBe("unknown");
  expect(result.output).toContain(handle!.path); expect(result.output).toContain(handle!.branch);
  expect(result.output).toContain(`delegation inspect ${childId}`);
  expect(progress.join("\n")).toContain(handle!.path);
});
