import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { swarmTool } from "./swarm.js";
import { InMemoryToolRegistry } from "./registry.js";
import type { AgentDeps } from "../agent.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import * as spawnModule from "../subagent/spawn.js";

const control = vi.hoisted(() => ({ provider: vi.fn(), registry: vi.fn() }));
vi.mock("../providers/index.js", async original => ({ ...await original<typeof import("../providers/index.js")>(), resolveProvider: control.provider }));
vi.mock("./index.js", () => ({ buildRegistry: control.registry }));
vi.mock("../settings/mcp-access.js", async original => ({ ...await original<typeof import("../settings/mcp-access.js")>(), mcpAutoMountEnabled: () => false }));
vi.mock("../subagent/spawn-guard.js", async original => ({ ...await original<typeof import("../subagent/spawn-guard.js")>(),
  checkSpawnDepth: async () => ({ allowed: true, reason: "private injected gate", depth: 1, maxDepth: 6 }) }));

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); control.provider.mockReset(); control.registry.mockReset();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function completion(text: string, tool?: string): CompletionResult {
  return { text, toolCalls: tool ? [{ id: tool, name: tool, arguments: {} }] : [],
    finishReason: tool ? "tool_calls" : "stop", usage: { inputTokens: 7, outputTokens: 2 } };
}

async function fixture(mode: "unknown" | "throw" | "success" | "read-limit" = "unknown") {
  const root = await mkdtemp(join(tmpdir(), "vanta-swarm-containment-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", root); vi.stubEnv("VANTA_AUTOCONTINUE", "0");
  const started = latch(), release = latch(), firstSettled = latch();
  const signals: (AbortSignal | undefined)[] = [];
  const original = spawnModule.spawnSubagent;
  vi.spyOn(spawnModule, "spawnSubagent").mockImplementation(async opts => {
    signals.push(opts.signal);
    const outcome = await original(opts);
    if (opts.goal === "A") {
      firstSettled.resolve();
      if (mode === "throw") throw new Error("Private worker failed after its partial effect");
    }
    return outcome;
  });
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "partial_action", description: "private fixture", parameters: {} },
    execute: async () => { await writeFile(join(root, "partial.txt"), "observed partial effect");
      return { ok: false, output: "Private uncertain effect", effectDisposition: "unknown" }; } });
  registry.register({ schema: { name: "read_file", description: "private fixture", parameters: {} },
    execute: async () => ({ ok: true, output: "Read-only result" }) });
  registry.register({ schema: { name: "later_action", description: "private fixture", parameters: {} },
    execute: async () => { await writeFile(join(root, "later.txt"), "later sibling action");
      return { ok: true, output: "Private later action", effectDisposition: "confirmed" }; } });
  const first = vi.fn<LLMProvider["complete"]>(async () => {
    await started.promise;
    return completion("A result", ["unknown", "throw"].includes(mode) ? "partial_action" : mode === "read-limit" ? "read_file" : undefined);
  });
  const second = vi.fn<LLMProvider["complete"]>()
    .mockImplementationOnce(async () => { started.resolve(); await release.promise; return completion("Late B result", "later_action"); })
    .mockResolvedValue(completion("B finished"));
  control.provider.mockImplementation((env: NodeJS.ProcessEnv) => ({ modelId: () => env.VANTA_MODEL ?? "private",
    contextWindow: () => 100000, complete: env.VANTA_MODEL === "worker-a" ? first : second }));
  control.registry.mockReturnValue(registry);
  const safety = { assess: async () => ({ risk: "allow", reason: "private injected gate" }), logEvent: async () => {} } as unknown as AgentDeps["safety"];
  const controller = new AbortController();
  const run = () => swarmTool.execute({ tasks: [{ goal: "A", instruction: "First", model: "worker-a" },
    { goal: "B", instruction: "Second", model: "worker-b" }], max_iterations: mode === "read-limit" ? 1 : 3 },
  { root, safety, signal: controller.signal, requestApproval: async () => false });
  return { root, run, controller, started, release, firstSettled, signals, first, second };
}

it.each(["unknown", "throw"] as const)("contains a running sibling after %s, preserving partial evidence", async mode => {
  const f = await fixture(mode); const result = f.run();
  try {
    await f.firstSettled.promise;
    await vi.waitFor(() => expect(f.signals[1]?.aborted).toBe(true));
  } finally { f.release.resolve(); await result; }
  expect(await result).toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
  expect(await readFile(join(f.root, "partial.txt"), "utf8")).toBe("observed partial effect");
  await expect(readFile(join(f.root, "later.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(f.second).toHaveBeenCalledOnce();
  expect(f.controller.signal.aborted).toBe(false);
});

it("retains ordinary parallel completion", async () => {
  const f = await fixture("success"); const result = f.run();
  try { await f.firstSettled.promise; expect(f.signals[1]?.aborted).toBe(false); }
  finally { f.release.resolve(); }
  expect(await result).toMatchObject({ ok: true, verification: { status: "unverified" } });
  expect(await readFile(join(f.root, "later.txt"), "utf8")).toBe("later sibling action");
});

it("does not confuse an independent read-only iteration limit with an unknown effect", async () => {
  const f = await fixture("read-limit"); const result = f.run();
  try { await f.firstSettled.promise; expect(f.signals[1]?.aborted).toBe(false); }
  finally { f.release.resolve(); }
  expect(await result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(await readFile(join(f.root, "later.txt"), "utf8")).toBe("later sibling action");
});

it("parent Stop still reaches both children and blocks late sibling actions", async () => {
  const f = await fixture("success"); const result = f.run();
  try { await f.started.promise; f.controller.abort(); }
  finally { f.release.resolve(); }
  expect(await result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(f.signals).toHaveLength(2);
  expect(f.signals.every(signal => signal?.aborted)).toBe(true);
  await expect(readFile(join(f.root, "later.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("does not start workers when the foreground turn is already stopped", async () => {
  const f = await fixture(); f.controller.abort();
  expect(await f.run()).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(f.signals).toHaveLength(0);
  expect(f.first).not.toHaveBeenCalled(); expect(f.second).not.toHaveBeenCalled();
});

it("keeps an independent sibling running after provider setup fails before a child starts", async () => {
  const f = await fixture("success");
  control.provider.mockImplementationOnce(() => { throw new Error("Private invalid provider setup"); });
  const result = f.run();
  try { await f.started.promise; expect(f.signals[0]?.aborted).toBe(false); }
  finally { f.release.resolve(); }
  expect(await result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(await readFile(join(f.root, "later.txt"), "utf8")).toBe("later sibling action");
});
