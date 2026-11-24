import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSubagent } from "./spawn.js";
import { inspectWorker } from "./worker-inspection.js";
import { appendRouteUsage, listRouteUsage } from "../cost/route-ledger.js";
import { listRuntimeResourceUsage } from "../cost/resource-ledger.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { ProviderRoute } from "../providers/interface.js";
import type { ToolContext } from "../tools/types.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-worker-usage-"));
  vi.stubEnv("HOME", root); vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("VANTA_SUBAGENT_PROGRESS", "0"); vi.stubEnv("VANTA_AUTOCONTINUE", "0");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const servedRoute: ProviderRoute = { provider: "fixture-local", model: "served-worker", baseRoute: "http://127.0.0.1:1", billingMode: "local", fallbackDepth: 1 };

it.each([false, true])("attributes actual worker completions without registering a chat (isolated root: %s)", async isolated => {
  const workerRoot = isolated ? join(root, "worker") : root;
  await mkdir(workerRoot, { recursive: true });
  const dataDir = join(root, ".vanta");
  const prior = await appendRouteUsage(dataDir, { callId: "parent-call", sessionId: "parent-chat", agent: "desktop",
    route: servedRoute, usage: { inputTokens: 2, outputTokens: 1 } });
  let calls = 0;
  const complete = vi.fn(async () => ++calls === 1
    ? { text: "Read", toolCalls: [{ id: "read-once", name: "read_file", arguments: {} }], finishReason: "tool_calls" as const,
      servedRoute, usage: { inputTokens: 17, outputTokens: 3, cacheTokens: 7 } }
    : { text: "Synthetic research complete.", toolCalls: [], finishReason: "stop" as const,
      servedRoute, usage: { inputTokens: 23, outputTokens: 4 } });
  const actionSessionIds: Array<string | undefined> = [];
  const execute = vi.fn(async (_args: Record<string, unknown>, ctx: ToolContext) => {
    actionSessionIds.push(ctx.sessionId);
    return { ok: true, output: "Synthetic research", effectDisposition: "none" as const };
  });
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "read_file", description: "Synthetic reader", parameters: {} }, execute });
  const deps: AgentDeps = { root: workerRoot, registry, requestApproval: async () => false,
    provider: { complete, modelId: () => "selected-worker", contextWindow: () => 100_000 },
    safety: { assess: async () => ({ risk: "allow", reason: "Synthetic fixture" }), logEvent: async () => {} } as unknown as AgentDeps["safety"] };
  const id = "accounted-child";
  const result = await spawnSubagent({ goal: "Read", instruction: "Read the synthetic record once, then summarize.", deps, maxIterations: 3,
    inspection: { id, root, workerRoot, parentSessionId: "parent-chat" },
    checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }) });
  expect(result.stoppedReason).toBe("done");
  expect(deps).not.toHaveProperty("providerUsage");
  expect(complete).toHaveBeenCalledTimes(2); expect(execute).toHaveBeenCalledOnce();
  expect(actionSessionIds).toEqual([undefined]);
  const rows = await listRouteUsage(dataDir);
  const childRows = rows.filter(row => row.sessionId === id);
  expect(childRows).toHaveLength(2);
  expect(childRows.map(row => [row.inputTokens, row.outputTokens, row.cacheTokens])).toEqual([[17, 3, 7], [23, 4, 0]]);
  expect(childRows.every(row => row.agent === "subagent" && row.model === "served-worker" && row.fallbackDepth === 1)).toBe(true);
  expect(rows.filter(row => row.sessionId === "parent-chat")).toEqual([prior]);
  expect(new Set(rows.map(row => row.callId)).size).toBe(3);
  const resources = await listRuntimeResourceUsage(dataDir, { taskId: id });
  expect(resources).toHaveLength(2);
  expect(resources.map(row => [row.sessionId, row.inputTokens, row.outputTokens])).toEqual([[id, 17, 3], [id, 23, 4]]);
  expect((await inspectWorker(root, id))?.record).toMatchObject({ parentSessionId: "parent-chat", continuationAllowed: false, remainingBudget: "unknown" });
  await expect(readdir(join(root, "home", "sessions"))).rejects.toMatchObject({ code: "ENOENT" });
  if (isolated) expect(await listRouteUsage(join(workerRoot, ".vanta"))).toEqual([]);
});

it.each([true, false])("accounts an anonymous child without manufacturing resource tokens (reported usage: %s)", async reported => {
  const complete = vi.fn(async () => ({ text: "Synthetic result", toolCalls: [], finishReason: "stop" as const, servedRoute,
    ...(reported ? { usage: { inputTokens: 11, outputTokens: 2 } } : {}) }));
  const deps: AgentDeps = { root, registry: new InMemoryToolRegistry(), requestApproval: async () => false,
    provider: { complete, modelId: () => "selected-worker", contextWindow: () => 100_000 }, safety: {} as AgentDeps["safety"] };
  await spawnSubagent({ goal: "Summarize", instruction: "Return the synthetic result.", deps,
    checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }) });
  const resources = await listRuntimeResourceUsage(join(root, ".vanta"));
  expect(resources).toHaveLength(1);
  expect(resources[0]).toMatchObject({ agent: "subagent", inputTokens: reported ? 11 : null, outputTokens: reported ? 2 : null });
  expect(resources[0]!.sessionId).toMatch(/^[a-f0-9-]{36}$/);
  expect(resources[0]!.taskId).toBe(resources[0]!.sessionId);
  expect((await listRouteUsage(join(root, ".vanta")))[0]?.sessionId).toBe(resources[0]!.sessionId);
  expect(complete).toHaveBeenCalledOnce();
  await expect(readdir(join(root, "home", "sessions"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("retains missing usage as unknown in a failed worker resource receipt, without a success row", async () => {
  const complete = vi.fn(async () => { throw new Error("Synthetic invalid request"); });
  const deps: AgentDeps = { root, registry: new InMemoryToolRegistry(), requestApproval: async () => false,
    provider: { complete, modelId: () => "selected-worker", contextWindow: () => 100_000, routeInfo: () => servedRoute },
    safety: {} as AgentDeps["safety"] };
  const id = "failed-accounted-child";
  await expect(spawnSubagent({ goal: "Read", instruction: "Read only", deps, maxIterations: 3,
    inspection: { id, root, workerRoot: root, parentSessionId: "parent-chat" },
    checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }) }))
    .rejects.toThrow("Synthetic invalid request");
  expect(complete).toHaveBeenCalledOnce();
  const rows = await listRuntimeResourceUsage(join(root, ".vanta"), { taskId: id });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ sessionId: id, inputTokens: null, outputTokens: null, failureClass: "provider_call_failed" });
  expect(await listRouteUsage(join(root, ".vanta"))).toEqual([]);
  expect((await inspectWorker(root, id))?.record).toMatchObject({ phase: "failed", iterationsReserved: 1, continuationAllowed: false });
  await expect(readdir(join(root, "home", "sessions"))).rejects.toMatchObject({ code: "ENOENT" });
});
