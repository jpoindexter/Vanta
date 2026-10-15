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
  resolveSecret?: (reference: string) => Promise<string>;
};

type Completion = { text: string; latencyMs: number; outputTokens: number };
class RuntimeFailure extends Error { constructor(readonly code: string) { super(code); } }
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const stateDir = (root: string): string => join(root, ".vanta", "runtime-engines");
const statePath = (root: string, id: string): string => join(stateDir(root), `${id}.json`);
const receiptPath = (root: string): string => join(stateDir(root), "receipts.jsonl");

function nodeProcessPort(): RuntimeProcessPort {
  return {
    start: async (command, args, environment) => {
      const child = spawnChild(command, [...args], { detached: true, stdio: "ignore", ...(environment ? { env: { ...process.env, ...environment } } : {}) });
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

type ManagerContext = {
  options: ManagerOptions;
  processPort: RuntimeProcessPort;
  fetcher: typeof globalThis.fetch;
  now: () => Date;
  wait: (ms: number) => Promise<void>;
  healthAttempts: number;
  healthIntervalMs: number;
};

type ReceiptInput = {
  preview: RuntimeLaunchPreview;
  transition: RuntimeLifecycleReceipt["transition"];
  code?: string;
  metrics?: RuntimeLifecycleReceipt["metrics"];
};

function managerContext(options: ManagerOptions): ManagerContext {
  return {
    options,
    processPort: options.process ?? nodeProcessPort(),
    fetcher: options.fetch ?? globalThis.fetch,
    now: options.now ?? (() => new Date()),
    wait: options.sleep ?? delay,
    healthAttempts: Math.max(1, Math.min(120, options.healthAttempts ?? 20)),
    healthIntervalMs: Math.max(0, options.healthIntervalMs ?? 250),
  };
}

async function receipt(ctx: ManagerContext, input: ReceiptInput): Promise<void> {
  const { preview, transition, code, metrics } = input;
  const value = RuntimeLifecycleReceiptSchema.parse({ version: 1, runtimeId: preview.runtimeId, backend: preview.backend, at: ctx.now().toISOString(), transition, commandHash: preview.commandHash, code, metrics });
  await mkdir(stateDir(ctx.options.root), { recursive: true });
  await appendFile(receiptPath(ctx.options.root), `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function healthy(ctx: ManagerContext, endpoint: string): Promise<boolean> {
  try { return (await ctx.fetcher(`${endpoint}/health`, { method: "GET" })).ok; } catch { return false; }
}

async function waitHealthy(ctx: ManagerContext, endpoint: string): Promise<void> {
  for (let attempt = 0; attempt < ctx.healthAttempts; attempt++) {
    if (await healthy(ctx, endpoint)) return;
    if (attempt + 1 < ctx.healthAttempts) await ctx.wait(ctx.healthIntervalMs);
  }
  throw new RuntimeFailure("health_timeout");
}

async function complete(ctx: ManagerContext, endpoint: string, model: string, prompt: string): Promise<Completion> {
  const started = Date.now();
  let response: Response;
  try {
    response = await ctx.fetcher(`${endpoint}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0 }) });
  } catch { throw new RuntimeFailure("provider_transport_failed"); }
  if (!response.ok) throw new RuntimeFailure("provider_http_failed");
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens?: number } };
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new RuntimeFailure("provider_shape_failed");
  return { text: text.trim(), latencyMs: Date.now() - started, outputTokens: Math.max(0, body.usage?.completion_tokens ?? 0) };
}

function initialState(ctx: ManagerContext, input: { spec: RuntimeLaunchSpec; preview: RuntimeLaunchPreview; status: RuntimeProcessState["status"]; pid?: number }): RuntimeProcessState {
  const { spec, preview, status, pid } = input;
  return RuntimeProcessStateSchema.parse({ version: 1, runtimeId: spec.id, backend: spec.backend, model: spec.model, host: spec.host, port: spec.port, contextTokens: spec.contextTokens, modelBytes: spec.modelBytes, availableMemoryBytes: spec.availableMemoryBytes, retainOnFailure: spec.retainOnFailure, extraArgs: spec.extraArgs ?? [], environment: spec.environment ?? {}, commandHash: preview.commandHash, pid, status, updatedAt: ctx.now().toISOString() });
}

function specFromState(state: RuntimeProcessState): RuntimeLaunchSpec {
  return RuntimeLaunchSpecSchema.parse({ id: state.runtimeId, backend: state.backend, model: state.model, host: state.host, port: state.port, contextTokens: state.contextTokens, modelBytes: state.modelBytes, availableMemoryBytes: state.availableMemoryBytes, retainOnFailure: state.retainOnFailure, extraArgs: state.extraArgs, environment: state.environment });
}

async function resolveEnvironment(ctx: ManagerContext, environment: Record<string, string>): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(environment).map(async ([name, value]) => {
    if (!value.startsWith("secret://")) return [name, value] as const;
    if (!ctx.options.resolveSecret) throw new RuntimeFailure("secret_unresolved");
    return [name, await ctx.options.resolveSecret(value)] as const;
  }));
  return Object.fromEntries(entries);
}

async function fail(ctx: ManagerContext, preview: RuntimeLaunchPreview, code: string, transition: RuntimeLifecycleReceipt["transition"] = "failed"): Promise<never> {
  await receipt(ctx, { preview, transition, code });
  throw new RuntimeFailure(code);
}

async function authorizeLaunch(ctx: ManagerContext, preview: RuntimeLaunchPreview): Promise<void> {
  if (!preview.resource.fits) await fail(ctx, preview, "resource_fit");
  if (preview.support === "contract_only" && !ctx.options.enableContractOnly) await fail(ctx, preview, "contract_only");
  const verdict = await ctx.options.assess(preview.approvalAction);
  if (verdict.risk === "block") await fail(ctx, preview, "kernel_blocked", "kernel_blocked");
  if (verdict.risk !== "ask") return;
  await receipt(ctx, { preview, transition: "approval_requested" });
  if (!await ctx.options.requestApproval(preview.approvalAction, preview)) await fail(ctx, preview, "approval_denied", "approval_denied");
}

async function startRuntime(ctx: ManagerContext, spec: RuntimeLaunchSpec, preview: RuntimeLaunchPreview): Promise<RuntimeProcessState> {
  try {
    const environment = await resolveEnvironment(ctx, spec.environment ?? {});
    const started = Object.keys(environment).length
      ? await ctx.processPort.start(preview.command, preview.args, environment)
      : await ctx.processPort.start(preview.command, preview.args);
    const state = initialState(ctx, { spec, preview, status: "starting", pid: started.pid });
    await atomicState(ctx.options.root, state);
    return state;
  } catch (error) {
    return fail(ctx, preview, error instanceof RuntimeFailure ? error.code : "spawn_failed");
  }
}

async function settleLaunchFailure(ctx: ManagerContext, input: { spec: RuntimeLaunchSpec; preview: RuntimeLaunchPreview; state: RuntimeProcessState; code: string }): Promise<void> {
  const { spec, preview, code } = input;
  let state: RuntimeProcessState = { ...input.state, status: "failed", updatedAt: ctx.now().toISOString() };
  await atomicState(ctx.options.root, state);
  await receipt(ctx, { preview, transition: "failed", code });
  if (spec.retainOnFailure) return receipt(ctx, { preview, transition: "retained_after_failure", code });
  if (state.pid && await ctx.processPort.alive(state.pid)) await ctx.processPort.stop(state.pid).catch(() => undefined);
  state = { ...state, status: "stopped", updatedAt: ctx.now().toISOString() };
  await atomicState(ctx.options.root, state);
  await receipt(ctx, { preview, transition: "stopped_after_failure", code });
}

async function proveRuntime(ctx: ManagerContext, spec: RuntimeLaunchSpec, preview: RuntimeLaunchPreview, state: RuntimeProcessState) {
  try {
    await waitHealthy(ctx, preview.endpoint);
    await receipt(ctx, { preview, transition: "healthy" });
    const benchmark = await complete(ctx, preview.endpoint, spec.model, "Reply with exactly VANTA_RUNTIME_OK");
    if (benchmark.text !== "VANTA_RUNTIME_OK") throw new RuntimeFailure("benchmark_mismatch");
    await receipt(ctx, { preview, transition: "benchmarked", metrics: { latencyMs: benchmark.latencyMs, outputTokens: benchmark.outputTokens } });
    const provider = await complete(ctx, preview.endpoint, spec.model, "Reply with exactly VANTA_PROVIDER_OK");
    if (provider.text !== "VANTA_PROVIDER_OK") throw new RuntimeFailure("provider_turn_mismatch");
    await receipt(ctx, { preview, transition: "provider_turn_verified", metrics: { latencyMs: provider.latencyMs, outputTokens: provider.outputTokens } });
    const running = { ...state, status: "running" as const, updatedAt: ctx.now().toISOString() };
    await atomicState(ctx.options.root, running);
    await receipt(ctx, { preview, transition: "running" });
    return { state: running, preview, benchmark: { latencyMs: benchmark.latencyMs, outputTokens: benchmark.outputTokens }, providerText: provider.text };
  } catch (error) {
    const code = error instanceof RuntimeFailure ? error.code : "downstream_failed";
    await settleLaunchFailure(ctx, { spec, preview, state, code });
    throw new RuntimeFailure(code);
  }
}

async function launch(ctx: ManagerContext, input: RuntimeLaunchSpec) {
  const spec = RuntimeLaunchSpecSchema.parse(input);
  const preview = runtimeLaunchPreview(spec);
  await receipt(ctx, { preview, transition: "previewed" });
  await authorizeLaunch(ctx, preview);
  await receipt(ctx, { preview, transition: "approved" });
  await receipt(ctx, { preview, transition: "starting" });
  const state = await startRuntime(ctx, spec, preview);
  return proveRuntime(ctx, spec, preview, state);
}

async function stop(ctx: ManagerContext, runtimeId: string): Promise<RuntimeProcessState> {
  let state = await loadState(ctx.options.root, runtimeId);
  const preview = runtimeLaunchPreview(specFromState(state));
  await receipt(ctx, { preview, transition: "stopping" });
  state = { ...state, status: "stopping", updatedAt: ctx.now().toISOString() };
  await atomicState(ctx.options.root, state);
  if (state.pid && await ctx.processPort.alive(state.pid)) await ctx.processPort.stop(state.pid);
  state = { ...state, status: "stopped", updatedAt: ctx.now().toISOString() };
  await atomicState(ctx.options.root, state);
  await receipt(ctx, { preview, transition: "stopped" });
  return state;
}

async function recoverState(ctx: ManagerContext, state: RuntimeProcessState): Promise<RuntimeProcessState> {
  const preview = runtimeLaunchPreview(specFromState(state));
  const alive = Boolean(state.pid && await ctx.processPort.alive(state.pid));
  if (!alive) {
    const failed = { ...state, status: "failed" as const, updatedAt: ctx.now().toISOString() };
    await atomicState(ctx.options.root, failed);
    await receipt(ctx, { preview, transition: "stale_process", code: "process_missing" });
    return failed;
  }
  const available = await healthy(ctx, preview.endpoint);
  const recovered = { ...state, status: available ? "running" as const : "failed" as const, updatedAt: ctx.now().toISOString() };
  await atomicState(ctx.options.root, recovered);
  await receipt(ctx, { preview, transition: available ? "recovered" : "stale_process", code: available ? undefined : "health_unavailable" });
  return recovered;
}

async function readRecoverableState(root: string, name: string): Promise<RuntimeProcessState | undefined> {
  try {
    const state = RuntimeProcessStateSchema.parse(JSON.parse(await readFile(join(stateDir(root), name), "utf8")));
    return ["starting", "running", "failed"].includes(state.status) ? state : undefined;
  } catch { return undefined; }
}

async function recover(ctx: ManagerContext): Promise<RuntimeProcessState[]> {
  let names: string[];
  try { names = (await readdir(stateDir(ctx.options.root))).filter((name) => name.endsWith(".json")); } catch { return []; }
  const states = await Promise.all(names.map((name) => readRecoverableState(ctx.options.root, name)));
  const recoverable = states.filter((state): state is RuntimeProcessState => state !== undefined);
  return Promise.all(recoverable.map((state) => recoverState(ctx, state)));
}

export function createRuntimeLifecycleManager(options: ManagerOptions): RuntimeLifecycleManager {
  const ctx = managerContext(options);
  return {
    preview: runtimeLaunchPreview,
    launch: (input) => launch(ctx, input),
    stop: (runtimeId) => stop(ctx, runtimeId),
    recover: () => recover(ctx),
  };
}
