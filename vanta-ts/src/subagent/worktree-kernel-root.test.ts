import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKernelClient } from "../kernel/client.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";

const probe = vi.hoisted(() => ({ workerRoot: "", spawn: vi.fn(), cleanup: vi.fn() }));
vi.mock("./spawn.js", () => ({ spawnSubagent: probe.spawn }));
vi.mock("../providers/index.js", () => ({ resolveProvider: () => ({}) }));
vi.mock("../worktree/manager.js", () => ({
  createWorktree: async () => ({ path: probe.workerRoot, branch: "fixture", cleanup: probe.cleanup }),
}));
import { delegateTool } from "../tools/delegate.js";
import { runFleet } from "../fleet/fleet.js";
import { runAutoResearch } from "../auto-research/loop.js";
import { readFile } from "node:fs/promises";
import { listDelegationTrees } from "./delegation-receipt.js";

let base: string, root: string, deps: AgentDeps;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "vanta-worker-kernel-"));
  root = join(base, "project");
  probe.workerRoot = join(base, "separate-worker");
  for (const folder of [root, probe.workerRoot, join(base, "home")]) mkdirSync(folder);
  vi.stubEnv("VANTA_HOME", join(base, "home"));
  vi.stubEnv("VANTA_PROFILE", "default");
  vi.stubEnv("VANTA_MCP_AUTO_MOUNT", "0");
  probe.spawn.mockResolvedValue({ finalText: "fixture", iterations: 1, stoppedReason: "done", toolIterations: 0 });
  deps = { root, safety: createKernelClient("http://127.0.0.1:1", root), registry: new InMemoryToolRegistry(),
    requestApproval: async () => false, provider: { complete: vi.fn(), modelId: () => "fixture", contextWindow: () => 8192 } };
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); rmSync(base, { recursive: true, force: true }); });

function expectScope() {
  expect(probe.spawn).toHaveBeenCalledOnce();
  const options = probe.spawn.mock.calls[0]![0];
  expect(options.kernelRoot).toBe(root);
  expect(options.deps.root).toBe(probe.workerRoot);
  expect(options.deps.safety).toBe(deps.safety);
}

it("binds delegated worktree spawn auth to the parent kernel without replacing its safety client", async () => {
  const result = await delegateTool.execute({ goal: "fixture", instruction: "fixture", isolation: "worktree" }, deps);
  expectScope();
  expect(probe.cleanup).not.toHaveBeenCalled();
  expect(result.output).toContain(probe.workerRoot);
  expect(result.output).toContain("fixture");
  expect(result.output).toContain(`delegation inspect ${probe.spawn.mock.calls[0]![0].inspection.id}`);
  expect(probe.spawn.mock.calls[0]![0].inspection).toMatchObject({ root, workerRoot: probe.workerRoot });
});

it("binds background custody, child inspection and final receipt to one stable identity", async () => {
  probe.spawn.mockResolvedValue({ finalText: "fixture", iterations: 1, stoppedReason: "done", toolIterations: 0,
    workerEvidence: { rawSidechain: ".vanta/sidechains/fixture.json", tools: [], durationMs: 1, model: "fixture" } });
  const result = await delegateTool.execute({ goal: "fixture", instruction: "fixture", background: true }, { ...deps, sessionId: "parent-fixture" });
  expect(result.ok).toBe(true);
  await vi.waitFor(async () => expect((await listDelegationTrees(root))[0]?.nodes).toHaveLength(1));
  const inspection = probe.spawn.mock.calls[0]![0].inspection;
  expect(inspection).toMatchObject({ id: inspection.custodyId, parentSessionId: "parent-fixture", root, workerRoot: root });
  const rows = (await readFile(join(root, ".vanta", "async-delegate.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  expect(rows[0]).toEqual({ event: "started", id: inspection.id });
  expect((await listDelegationTrees(root))[0]?.nodes[0]?.id).toBe(inspection.id);
  expect((await listDelegationTrees(root))[0]?.nodes[0]?.rawSidechain).toBe(join(root, ".vanta", "sidechains", "fixture.json"));
  expect(result.output).toContain(`delegation inspect ${inspection.id}`);
});

it("binds the real fleet spawn adapter to the parent kernel identity", async () => {
  await runFleet({ repoRoot: root, deps, fleetId: "fixture", specs: [{ id: "one", title: "fixture", instruction: "fixture" }],
    fleetDeps: { appendTask: async () => {}, diff: async () => "fixture" } });
  expectScope();
});

it("binds the real auto-research spawn adapter to the parent kernel identity", async () => {
  await runAutoResearch({ repoRoot: root, deps,
    opts: { objective: "fixture", metric: "fixture", bounds: "fixture", maxIters: 1, stopAfterNoProgress: 1 },
    hooks: { metric: async () => ({ score: 1, output: "fixture" }), commit: async () => ({ sha: null, summary: "fixture" }),
      cleanup: async () => {}, journal: () => {} } });
  expectScope();
});
