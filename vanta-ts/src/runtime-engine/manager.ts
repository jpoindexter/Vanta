import { spawn as spawnChild } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Verdict } from "../types.js";
import { runtimeLaunchPreview } from "./profiles.js";
import {
  RuntimeLifecycleReceiptSchema,
  RuntimeLaunchSpecSchema,
  RuntimeProcessStateSchema,
  type RuntimeLifecycleManager,
  type RuntimeLifecycleReceipt,
  type RuntimeLaunchPreview,
  type RuntimeLaunchSpec,
  type RuntimeProcessPort,
  type RuntimeProcessState,
} from "./types.js";

type ManagerOptions = {
  root: string;
  process?: RuntimeProcessPort;
  assess: (action: string) => Promise<Verdict>;
  requestApproval: (action: string, preview: RuntimeLaunchPreview) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  healthAttempts?: number;
  healthIntervalMs?: number;
  enableContractOnly?: boolean;
};

type Completion = { text: string; latencyMs: number; outputTokens: number };
class RuntimeFailure extends Error { constructor(readonly code: string) { super(code); } }
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const stateDir = (root: string): string => join(root, ".vanta", "runtime-engines");
const statePath = (root: string, id: string): string => join(stateDir(root), `${id}.json`);
const receiptPath = (root: string): string => join(stateDir(root), "receipts.jsonl");

function nodeProcessPort(): RuntimeProcessPort {
  return {
    start: async (command, args) => {
      const child = spawnChild(command, [...args], { detached: true, stdio: "ignore" });
      if (!child.pid) throw new RuntimeFailure("spawn_failed");
      child.unref();
      return { pid: child.pid };
    },
    alive: async (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } },
    stop: async (pid) => { process.kill(pid, "SIGTERM"); },
  };
}

async function atomicState(root: string, state: RuntimeProcessState): Promise<void> {
  const path = statePath(root, state.runtimeId);
  await mkdir(stateDir(root), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(RuntimeProcessStateSchema.parse(state), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function loadState(root: string, runtimeId: string): Promise<RuntimeProcessState> {
  try { return RuntimeProcessStateSchema.parse(JSON.parse(await readFile(statePath(root, runtimeId), "utf8"))); }
  catch { throw new RuntimeFailure("runtime_state_missing"); }
}

export async function readRuntimeLifecycleReceipts(root: string): Promise<RuntimeLifecycleReceipt[]> {
  try {
    const lines = (await readFile(receiptPath(root), "utf8")).split("\n").filter(Boolean);
    return lines.map((line) => RuntimeLifecycleReceiptSchema.parse(JSON.parse(line)));
  } catch { return []; }
}

export function createRuntimeLifecycleManager(options: ManagerOptions): RuntimeLifecycleManager {
  const processPort = options.process ?? nodeProcessPort();
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const wait = options.sleep ?? delay;
  const healthAttempts = Math.max(1, Math.min(120, options.healthAttempts ?? 20));
  const healthIntervalMs = Math.max(0, options.healthIntervalMs ?? 250);

  async function receipt(preview: RuntimeLaunchPreview, transition: RuntimeLifecycleReceipt["transition"], code?: string, metrics?: RuntimeLifecycleReceipt["metrics"]): Promise<void> {
    const value = RuntimeLifecycleReceiptSchema.parse({ version: 1, runtimeId: preview.runtimeId, backend: preview.backend, at: now().toISOString(), transition, commandHash: preview.commandHash, code, metrics });
    await mkdir(stateDir(options.root), { recursive: true });
    await appendFile(receiptPath(options.root), `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async function healthy(endpoint: string): Promise<boolean> {
    try { return (await fetcher(`${endpoint}/health`, { method: "GET" })).ok; } catch { return false; }
  }

  async function waitHealthy(endpoint: string): Promise<void> {
    for (let attempt = 0; attempt < healthAttempts; attempt++) {
      if (await healthy(endpoint)) return;
      if (attempt + 1 < healthAttempts) await wait(healthIntervalMs);
    }
    throw new RuntimeFailure("health_timeout");
  }

  async function complete(endpoint: string, prompt: string): Promise<Completion> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetcher(`${endpoint}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "runtime-proof", messages: [{ role: "user", content: prompt }], temperature: 0 }) });
    } catch { throw new RuntimeFailure("provider_transport_failed"); }
    if (!response.ok) throw new RuntimeFailure("provider_http_failed");
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens?: number } };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new RuntimeFailure("provider_shape_failed");
    return { text: text.trim(), latencyMs: Date.now() - started, outputTokens: Math.max(0, body.usage?.completion_tokens ?? 0) };
  }

  function initialState(spec: RuntimeLaunchSpec, preview: RuntimeLaunchPreview, status: RuntimeProcessState["status"], pid?: number): RuntimeProcessState {
    return RuntimeProcessStateSchema.parse({ version: 1, runtimeId: spec.id, backend: spec.backend, model: spec.model, host: spec.host, port: spec.port, contextTokens: spec.contextTokens, modelBytes: spec.modelBytes, availableMemoryBytes: spec.availableMemoryBytes, retainOnFailure: spec.retainOnFailure, commandHash: preview.commandHash, pid, status, updatedAt: now().toISOString() });
  }

  function specFromState(state: RuntimeProcessState): RuntimeLaunchSpec {
    return RuntimeLaunchSpecSchema.parse({ id: state.runtimeId, backend: state.backend, model: state.model, host: state.host, port: state.port, contextTokens: state.contextTokens, modelBytes: state.modelBytes, availableMemoryBytes: state.availableMemoryBytes, retainOnFailure: state.retainOnFailure });
  }

  async function launch(input: RuntimeLaunchSpec) {
    const spec = RuntimeLaunchSpecSchema.parse(input);
    const preview = runtimeLaunchPreview(spec);
    await receipt(preview, "previewed");
    if (!preview.resource.fits) { await receipt(preview, "failed", "resource_fit"); throw new RuntimeFailure("resource_fit"); }
    if (preview.support === "contract_only" && !options.enableContractOnly) { await receipt(preview, "failed", "contract_only"); throw new RuntimeFailure("contract_only"); }
    const verdict = await options.assess(preview.approvalAction);
    if (verdict.risk === "block") { await receipt(preview, "kernel_blocked", "kernel_blocked"); throw new RuntimeFailure("kernel_blocked"); }
    if (verdict.risk === "ask") {
      await receipt(preview, "approval_requested");
      if (!await options.requestApproval(preview.approvalAction, preview)) { await receipt(preview, "approval_denied", "approval_denied"); throw new RuntimeFailure("approval_denied"); }
    }
    await receipt(preview, "approved");
    await receipt(preview, "starting");
    let state: RuntimeProcessState;
    try {
      const started = await processPort.start(preview.command, preview.args);
      state = initialState(spec, preview, "starting", started.pid);
      await atomicState(options.root, state);
    } catch { await receipt(preview, "failed", "spawn_failed"); throw new RuntimeFailure("spawn_failed"); }

    try {
      await waitHealthy(preview.endpoint);
      await receipt(preview, "healthy");
      const benchmark = await complete(preview.endpoint, "Reply with exactly VANTA_RUNTIME_OK");
      if (benchmark.text !== "VANTA_RUNTIME_OK") throw new RuntimeFailure("benchmark_mismatch");
      await receipt(preview, "benchmarked", undefined, { latencyMs: benchmark.latencyMs, outputTokens: benchmark.outputTokens });
      const provider = await complete(preview.endpoint, "Reply with exactly VANTA_PROVIDER_OK");
      if (provider.text !== "VANTA_PROVIDER_OK") throw new RuntimeFailure("provider_turn_mismatch");
      await receipt(preview, "provider_turn_verified", undefined, { latencyMs: provider.latencyMs, outputTokens: provider.outputTokens });
      state = { ...state, status: "running", updatedAt: now().toISOString() };
      await atomicState(options.root, state);
      await receipt(preview, "running");
      return { state, preview, benchmark: { latencyMs: benchmark.latencyMs, outputTokens: benchmark.outputTokens }, providerText: provider.text };
    } catch (error) {
      const code = error instanceof RuntimeFailure ? error.code : "downstream_failed";
      state = { ...state, status: "failed", updatedAt: now().toISOString() };
      await atomicState(options.root, state);
      await receipt(preview, "failed", code);
      if (spec.retainOnFailure) await receipt(preview, "retained_after_failure", code);
      else {
        if (state.pid && await processPort.alive(state.pid)) await processPort.stop(state.pid).catch(() => undefined);
        state = { ...state, status: "stopped", updatedAt: now().toISOString() };
        await atomicState(options.root, state);
        await receipt(preview, "stopped_after_failure", code);
      }
      throw new RuntimeFailure(code);
    }
  }

  async function stop(runtimeId: string): Promise<RuntimeProcessState> {
    let state = await loadState(options.root, runtimeId);
    const preview = runtimeLaunchPreview(specFromState(state));
    await receipt(preview, "stopping");
    state = { ...state, status: "stopping", updatedAt: now().toISOString() };
    await atomicState(options.root, state);
    if (state.pid && await processPort.alive(state.pid)) await processPort.stop(state.pid);
    state = { ...state, status: "stopped", updatedAt: now().toISOString() };
    await atomicState(options.root, state);
    await receipt(preview, "stopped");
    return state;
  }

  async function recover(): Promise<RuntimeProcessState[]> {
    let names: string[];
    try { names = (await readdir(stateDir(options.root))).filter((name) => name.endsWith(".json")); } catch { return []; }
    const recovered: RuntimeProcessState[] = [];
    for (const name of names) {
      let state: RuntimeProcessState;
      try { state = RuntimeProcessStateSchema.parse(JSON.parse(await readFile(join(stateDir(options.root), name), "utf8"))); } catch { continue; }
      if (!["starting", "running", "failed"].includes(state.status)) continue;
      const preview = runtimeLaunchPreview(specFromState(state));
      const alive = Boolean(state.pid && await processPort.alive(state.pid));
      if (!alive) {
        state = { ...state, status: "failed", updatedAt: now().toISOString() };
        await atomicState(options.root, state);
        await receipt(preview, "stale_process", "process_missing");
      } else if (await healthy(preview.endpoint)) {
        state = { ...state, status: "running", updatedAt: now().toISOString() };
        await atomicState(options.root, state);
        await receipt(preview, "recovered");
      } else {
        state = { ...state, status: "failed", updatedAt: now().toISOString() };
        await atomicState(options.root, state);
        await receipt(preview, "stale_process", "health_unavailable");
      }
      recovered.push(state);
    }
    return recovered;
  }

  return { preview: runtimeLaunchPreview, launch, stop, recover };
}
