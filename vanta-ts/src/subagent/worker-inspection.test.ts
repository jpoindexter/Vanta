import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { startWorkerInspection, inspectWorker, formatWorkerInspection } from "./worker-inspection.js";
import { beginAsyncResult } from "./async-delegate.js";
import { readAsyncQueue } from "./async-result-record.js";
import { checkpointToolTranscript } from "../agent/effect-persistence.js";
import { runAgentsCommand } from "../cli/agents-cmd.js";
import { spawnSubagent } from "./spawn.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";

let root: string;
const children = new Set<ChildProcess>();
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-child-inspection-"));
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("HOME", root);
});
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    }
  }
  children.clear(); vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
const options = () => ({ id: "child-1", root, workerRoot: root, goal: "Research", instruction: "Read only",
  parentSessionId: "parent-1", agentType: "research", model: "offline", declaredMaxIterations: 3 });
const path = () => join(root, ".vanta", "sidechains", "worker-child-1.json");

describe("private worker inspection", () => {
  it("durably creates a private start record, checkpoints tool truth, and never registers a normal session", async () => {
    const store = await startWorkerInspection(options());
    expect((await inspectWorker(root, "child-1"))?.record).toMatchObject({ parentSessionId: "parent-1", sequence: 0,
      phase: "partial", remainingBudget: "unknown", continuationAllowed: false });
    await store.checkpoint([{ role: "assistant", content: "Partial", toolCalls: [{ id: "uncertain", name: "write_file", arguments: {}, effectState: "started" }] }]);
    const inspected = await inspectWorker(root, "child-1");
    expect(inspected?.record.messages[0]).toMatchObject({ toolCalls: [{ effectState: "started" }] });
    expect(formatWorkerInspection(inspected!)).toContain("remaining budget unknown");
    expect((await stat(path())).mode & 0o777).toBe(0o600);
    await expect(readdir(join(root, "home", "sessions"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("inspection preserves unresolved custody and does not append tasks or alter bytes", async () => {
    await mkdir(join(root, ".vanta"));
    await beginAsyncResult(join(root, ".vanta"), "child-1");
    await startWorkerInspection({ ...options(), custodyId: "child-1" });
    const queuePath = join(root, ".vanta", "async-delegate.jsonl");
    const before = await readFile(queuePath, "utf8");
    const saved = await readFile(path(), "utf8");
    const logs: string[] = [];
    expect(await runAgentsCommand(root, ["delegation", "inspect", "child-1"], { env: { VANTA_HOME: join(root, "home") }, log: line => logs.push(line) })).toBe(0);
    expect(logs.join("\n")).toContain("custody review required");
    expect(await readFile(queuePath, "utf8")).toBe(before);
    expect(await readFile(path(), "utf8")).toBe(saved);
    expect(readAsyncQueue(before).review).toBe(true);
    await expect(readFile(join(root, "home", "team-tasks.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects reused identities, path traversal, foreign identity and symlink ancestors without replacing evidence", async () => {
    await startWorkerInspection(options());
    const original = await readFile(path(), "utf8");
    await expect(startWorkerInspection(options())).rejects.toThrow("already exists");
    await expect(inspectWorker(root, "../child-1")).rejects.toThrow();
    const tampered = JSON.stringify({ ...JSON.parse(original), root: "/another-project" });
    await writeFile(path(), tampered);
    await expect(inspectWorker(root, "child-1")).rejects.toThrow("project mismatch");
    expect(await readFile(path(), "utf8")).toBe(tampered);
    const other = join(root, "other"); await mkdir(other);
    await symlink(join(root, ".vanta"), join(other, ".vanta"));
    await expect(inspectWorker(other, "child-1")).rejects.toThrow("directory");
  });

  it("retains malformed evidence and rejects over-limit checkpoints before the next action", async () => {
    const store = await startWorkerInspection(options());
    const original = await readFile(path(), "utf8");
    await expect(store.checkpoint([{ role: "user", content: "x".repeat(8 * 1024 * 1024) }])).rejects.toThrow("limit");
    expect(await readFile(path(), "utf8")).toBe(original);
    await writeFile(path(), "{corrupt}");
    await expect(inspectWorker(root, "child-1")).rejects.toThrow();
    await expect(store.checkpoint([])).rejects.toThrow();
    expect(await readFile(path(), "utf8")).toBe("{corrupt}");
  });

  it("rejects identity edits even at the same checkpoint sequence and bounds offline reads", async () => {
    const store = await startWorkerInspection(options());
    const changed = JSON.stringify({ ...JSON.parse(await readFile(path(), "utf8")), workerRoot: "/foreign-worker" });
    await writeFile(path(), changed);
    await expect(store.checkpoint([])).rejects.toThrow("changed");
    expect(await readFile(path(), "utf8")).toBe(changed);
    await writeFile(path(), "x".repeat(8 * 1024 * 1024 + 1));
    await expect(inspectWorker(root, "child-1")).rejects.toThrow("limit");
  });

  it("redacts and removes terminal controls from metadata as well as transcript excerpts", async () => {
    await startWorkerInspection({ ...options(), model: "model\u001b[31m\nfake-line", parentSessionId: "parent\r\u202econtrol" });
    const inspected = await inspectWorker(root, "child-1");
    const formatted = formatWorkerInspection(inspected!);
    expect(formatted).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e]/);
    expect(formatted).not.toContain("\nfake-line");
    expect(formatted).toContain("queue-wide custody review");
  });

  it("awaits the child callback and propagates failure even without a sessionId", async () => {
    let release!: () => void;
    const order: string[] = [];
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saving = checkpointToolTranscript(undefined, [], async () => { order.push("start"); await gate; order.push("saved"); });
    saving.then(() => order.push("next action"));
    await Promise.resolve(); expect(order).toEqual(["start"]);
    release(); await saving; expect(order).toEqual(["start", "saved", "next action"]);
    await expect(checkpointToolTranscript(undefined, [], async () => { throw new Error("not durable"); })).rejects.toThrow("not durable");
  });

  it.each(["pending", "started"])("stops the actual worker before a tool when its %s checkpoint fails", async boundary => {
    await mkdir(join(root, ".vanta"));
    await beginAsyncResult(join(root, ".vanta"), "child-1");
    const execute = vi.fn(async () => ({ ok: true, output: "Must not run" }));
    const registry = new InMemoryToolRegistry();
    registry.register({ schema: { name: "read_file", description: "Synthetic reader", parameters: {} }, execute });
    const complete = vi.fn(async () => {
      expect((await inspectWorker(root, "child-1"))?.record.messages.some(row => row.role === "user")).toBe(true);
      if (boundary === "pending") await writeFile(path(), "{corrupt evidence}");
      return { text: "About to read", toolCalls: [{ id: "not-started", name: "read_file", arguments: {} }], finishReason: "tool_calls" as const };
    });
    const deps: AgentDeps = { root, registry, requestApproval: async () => false,
      provider: { complete, modelId: () => "offline", contextWindow: () => 100_000 },
      safety: { assess: async () => {
        if (boundary === "started") await writeFile(path(), "{corrupt evidence}");
        return { risk: "allow", reason: "Synthetic fixture" };
      }, logEvent: async () => {} } as unknown as AgentDeps["safety"] };
    await expect(spawnSubagent({ goal: "Read", instruction: "Synthetic read", deps,
      inspection: { id: "child-1", custodyId: "child-1", root, workerRoot: root },
      checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }) })).rejects.toThrow();
    expect(complete).toHaveBeenCalledOnce(); expect(execute).not.toHaveBeenCalled();
    expect(await readFile(path(), "utf8")).toBe("{corrupt evidence}");
    expect(readAsyncQueue(await readFile(join(root, ".vanta", "async-delegate.jsonl"), "utf8")).review).toBe(true);
  });
});

function fixture(mode: "worker" | "worker-text" | "inspect"): ChildProcess {
  const child = fork(new URL("./worker-inspection.fixture.ts", import.meta.url), [mode, root], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH, HOME: root, VANTA_HOME: join(root, "home"), VANTA_AUTOCONTINUE: "0", VANTA_PROVIDER_RETRIES: "0" },
  });
  children.add(child); return child;
}
function message(child: ChildProcess): Promise<any> {
  return new Promise((resolve, reject) => {
    let stderr = ""; child.stderr?.on("data", chunk => { stderr += String(chunk); });
    child.once("message", resolve);
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Fixture exited ${code} before IPC: ${stderr}`)));
  });
}

it.each(["worker", "worker-text"] as const)("inspects %s partial work in a fresh process after an actual owned crash, with zero replay", async mode => {
  const worker = fixture(mode);
  const ready = await message(worker);
  expect(ready).toMatchObject({ ready: true });
  expect(ready.checkpoint).toBeGreaterThan(1);
  const exited = once(worker, "exit"); worker.kill("SIGKILL"); await exited;
  const calls = await readFile(join(root, "calls.jsonl"), "utf8");
  expect(calls.trim().split("\n")).toEqual(mode === "worker" ? ["model", "tool", "model"] : ["model", "model"]);
  const ledgerPath = join(root, ".vanta", "async-delegate.jsonl");
  const ledger = await readFile(ledgerPath, "utf8");
  const inspector = fixture("inspect");
  const cold = await message(inspector);
  if (inspector.exitCode === null) await once(inspector, "exit");
  expect(inspector.exitCode).toBe(0);
  expect(cold).toMatchObject({ code: 0, inspection: { custodyReview: true, record: {
    id: "restart-child", custodyId: "restart-child", parentSessionId: "fixture-parent", phase: "partial",
    declaredMaxIterations: 3, remainingBudget: "unknown", continuationAllowed: false,
  } } });
  const recovered = cold.inspection.record.messages as Array<{ role: string; content: string }>;
  expect(mode === "worker" ? recovered.some(row => row.role === "tool" && row.content === "Synthetic partial research")
    : recovered.some(row => row.role === "user" && row.content.startsWith("You returned nothing"))).toBe(true);
  expect(cold.logs.join("\n")).toContain("custody review required");
  expect(await readFile(join(root, "calls.jsonl"), "utf8")).toBe(calls);
  expect(await readFile(ledgerPath, "utf8")).toBe(ledger);
  expect(readAsyncQueue(ledger).review).toBe(true);
  await expect(readdir(join(root, "home", "sessions"))).rejects.toMatchObject({ code: "ENOENT" });
});
