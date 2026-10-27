import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTurn } from "../agent/turn-loop.js";
import { InMemoryToolRegistry } from "./registry.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import { delegateTool } from "./delegate.js";
import { swarmTool } from "./swarm.js";
import type { Tool } from "./types.js";
import * as spawnModule from "../subagent/spawn.js";
import { listDelegationTrees } from "../subagent/delegation-receipt.js";
import { runReplLoop, type ReplDeps } from "../interactive-repl.js";
import * as asyncModule from "../subagent/async-delegate.js";

const control = vi.hoisted(() => ({ provider: vi.fn(), registry: vi.fn() }));
vi.mock("../providers/index.js", async importOriginal => ({ ...await importOriginal<typeof import("../providers/index.js")>(), resolveProvider: control.provider }));
vi.mock("./index.js", () => ({ buildRegistry: control.registry }));
vi.mock("../settings/mcp-access.js", async importOriginal => ({ ...await importOriginal<typeof import("../settings/mcp-access.js")>(), mcpAutoMountEnabled: () => false }));
vi.mock("../subagent/spawn-guard.js", async importOriginal => ({ ...await importOriginal<typeof import("../subagent/spawn-guard.js")>(),
  checkSpawnDepth: async () => ({ allowed: true, reason: "private injected spawn gate", depth: 1, maxDepth: 6 }) }));

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); control.provider.mockReset(); control.registry.mockReset();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const childUsage = { inputTokens: 13, outputTokens: 3 };
const parentUsage = { inputTokens: 7, outputTokens: 2 };

async function fixture(uncertain: boolean) {
  const root = await mkdtemp(join(tmpdir(), "vanta-child-result-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", root); vi.stubEnv("VANTA_AUTOCONTINUE", "0");
  const childRegistry = new InMemoryToolRegistry();
  const childEffect = vi.fn(async () => ({ ok: false, output: "Private partial child action", effectDisposition: "unknown" as const }));
  childRegistry.register({ schema: { name: "child_action", description: "fixture", parameters: {} }, execute: childEffect });
  const complete = vi.fn<LLMProvider["complete"]>().mockResolvedValue({ text: "Child answer", toolCalls: [], finishReason: "stop", usage: childUsage });
  if (uncertain) complete.mockResolvedValueOnce({ text: "Child partial text", toolCalls: [{ id: "child-effect", name: "child_action", arguments: {} }], finishReason: "tool_calls", usage: childUsage });
  control.provider.mockReturnValue({ modelId: () => "child-fixture", contextWindow: () => 100000, complete });
  control.registry.mockReturnValue(childRegistry);
  const safety = { assess: async () => ({ risk: "allow", reason: "private injected gate" }), logEvent: async () => {} } as unknown as AgentDeps["safety"];
  return { root, complete, childEffect, safety };
}

async function parent(f: Awaited<ReturnType<typeof fixture>>, tool: Tool, withLaterMutation: boolean) {
  const registry = new InMemoryToolRegistry(); registry.register(tool);
  const later = vi.fn(async () => ({ ok: true, output: "Must not execute after uncertainty", effectDisposition: "confirmed" as const }));
  registry.register({ schema: { name: "write_file", description: "private fixture", parameters: {} }, execute: later });
  const args = tool === delegateTool ? { goal: "Private child", instruction: "Handle action" } : { tasks: [{ goal: "Private child", instruction: "Handle action" }] };
  const calls = [{ id: "delegate-one", name: tool.schema.name, arguments: args }, ...(withLaterMutation ? [{ id: "later-effect", name: "write_file", arguments: {} }] : [])];
  const complete = vi.fn<LLMProvider["complete"]>().mockResolvedValue({ text: "Parent answer", toolCalls: [], finishReason: "stop", usage: parentUsage });
  complete.mockResolvedValueOnce({ text: "Parent partial text", toolCalls: calls, finishReason: "tool_calls", usage: parentUsage });
  const provider: LLMProvider = { modelId: () => "parent-fixture", contextWindow: () => 100000, complete };
  const outcome = await runTurn({ messages: [{ role: "system", content: "Private parent" }], userText: "Delegate this action",
    ctx: { root: f.root, safety: f.safety, requestApproval: async () => false },
    deps: { root: f.root, safety: f.safety, requestApproval: async () => false, provider, registry } });
  return { outcome, complete, later };
}

async function childOutcomes(root: string): Promise<AgentOutcome[]> {
  const dir = join(root, ".vanta", "sidechains");
  return Promise.all((await readdir(dir)).map(async file => JSON.parse(await readFile(join(dir, file), "utf8")).outcome as AgentOutcome));
}

describe.each([["delegate", delegateTool], ["swarm", swarmTool]] as const)("%s child result propagation", (_name, tool) => {
  it("stops the real parent after one uncertain child without later tools/provider calls", async () => {
    const f = await fixture(true); const p = await parent(f, tool, true);
    expect(p.outcome).toMatchObject({ stoppedReason: "blocked", completionState: "needs human", needsEffectReview: true, usage: parentUsage });
    expect(p.complete).toHaveBeenCalledOnce(); expect(f.complete).toHaveBeenCalledOnce(); expect(f.childEffect).toHaveBeenCalledOnce(); expect(p.later).not.toHaveBeenCalled();
    expect(await childOutcomes(f.root)).toMatchObject([{ needsEffectReview: true, usage: childUsage }]);
  });

  it("preserves ordinary child success and separate child/parent usage", async () => {
    const f = await fixture(false); const p = await parent(f, tool, false);
    expect(p.outcome).toMatchObject({ stoppedReason: "done", usage: { inputTokens: 14, outputTokens: 4 } });
    expect(p.outcome.needsEffectReview).toBeUndefined();
    expect(await childOutcomes(f.root)).toMatchObject([{ stoppedReason: "done", usage: childUsage }]);
  });
});

it("never records a pass for a child claiming done while requiring effect review", async () => {
  const f = await fixture(false);
  vi.spyOn(spawnModule, "spawnSubagent").mockResolvedValueOnce({ finalText: "All done", stoppedReason: "done", needsEffectReview: true,
    iterations: 1, toolIterations: 1, completionState: "verified", usage: childUsage,
    workerEvidence: { rawSidechain: "private-fixture-sidechain", model: "child-fixture", tools: ["child_action"], durationMs: 1 } });
  const p = await parent(f, delegateTool, true);
  expect(p.outcome).toMatchObject({ stoppedReason: "blocked", needsEffectReview: true, usage: parentUsage });
  expect((await listDelegationTrees(f.root))[0]?.nodes[0]).toMatchObject({ verification: "fail", usage: childUsage });
  expect(p.later).not.toHaveBeenCalled(); expect(p.complete).toHaveBeenCalledOnce();
});

it.each([["delegate", delegateTool], ["swarm", swarmTool]] as const)("keeps %s conservative if a child throws after a partial effect", async (_name, tool) => {
  const f = await fixture(false);
  const marker = join(f.root, "private-partial-effect.txt");
  vi.spyOn(spawnModule, "spawnSubagent").mockImplementationOnce(async () => { await writeFile(marker, "partial"); throw new Error("private worker failure after effect"); });
  const p = await parent(f, tool, true);
  expect(p.outcome).toMatchObject({ stoppedReason: "blocked", needsEffectReview: true, usage: parentUsage });
  expect(await readFile(marker, "utf8")).toBe("partial");
  expect(p.later).not.toHaveBeenCalled(); expect(p.complete).toHaveBeenCalledOnce();
});

it.each([true, false])("preserves the actual background child's uncertainty=%s through queue and idle consumer", async uncertain => {
  const f = await fixture(uncertain);
  const ack = await delegateTool.execute({ goal: "Private background", instruction: "Handle action", background: true },
    { root: f.root, safety: f.safety, requestApproval: async () => false });
  expect(ack.ok).toBe(true);
  const dataDir = join(f.root, ".vanta");
  const queue = join(dataDir, "async-delegate.jsonl");
  await vi.waitFor(async () => expect(await readFile(queue, "utf8")).toContain('"finishedAt"'));
  const records = (await readFile(queue, "utf8")).trim().split("\n");
  expect(JSON.parse(records[0]!)).toMatchObject({ event: "started" });
  const stored = JSON.parse(records[1]!) as { ok: boolean; effectDisposition?: string };
  expect(stored.ok).toBe(!uncertain);
  if (uncertain) expect(stored.effectDisposition).toBe("unknown");
  expect((await listDelegationTrees(f.root))[0]?.nodes[0]).toMatchObject({ usage: childUsage, verification: uncertain ? "fail" : "pass" });
  expect(await childOutcomes(f.root)).toMatchObject([{ usage: childUsage }]);
  const resumed = vi.fn(async () => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const deps = { ctx: { dataDir }, runUserTurn: resumed,
    rl: { question: async () => { throw new Error("Private EOF"); } } } as unknown as ReplDeps;
  await runReplLoop(deps);
  await runReplLoop(deps);
  expect(resumed).toHaveBeenCalledTimes(uncertain ? 0 : 1);
  expect(f.complete).toHaveBeenCalledOnce();
});

it("keeps durable custody after a real child's terminal enqueue fails", async () => {
  const f = await fixture(true);
  vi.spyOn(asyncModule, "enqueueAsyncResult").mockRejectedValueOnce(new Error("Private terminal write failure"));
  const progress = vi.fn();
  await delegateTool.execute({ goal: "Private background", instruction: "Handle action", background: true },
    { root: f.root, safety: f.safety, requestApproval: async () => false, onProgress: progress });
  await vi.waitFor(() => expect(progress).toHaveBeenCalledOnce());
  const dataDir = join(f.root, ".vanta");
  const stored = (await readFile(join(dataDir, "async-delegate.jsonl"), "utf8")).trim().split("\n");
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0]!)).toMatchObject({ event: "started" });
  expect(await asyncModule.drainAsyncReentry(dataDir)).toMatchObject({ kind: "review" });
  expect(f.complete).toHaveBeenCalledOnce();
  expect((await listDelegationTrees(f.root))[0]?.nodes[0]).toMatchObject({ usage: childUsage, verification: "fail" });
});

it("does not start a child when initial durable custody fails", async () => {
  const f = await fixture(false);
  vi.spyOn(asyncModule, "beginAsyncResult").mockRejectedValueOnce(new Error("Private reservation failure"));
  const result = await delegateTool.execute({ goal: "Private background", instruction: "Handle action", background: true },
    { root: f.root, safety: f.safety, requestApproval: async () => false });
  expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.childEffect).not.toHaveBeenCalled();
});
