import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ProviderRoute, Usage } from "../providers/interface.js";
import { readRuntimeLifecycleReceipts } from "../runtime-engine/manager.js";
import { readSelectedRuntimeProfile } from "../runtime-engine/profile-store.js";
import type { RuntimeProfile } from "../runtime-engine/profile-contract.js";
import { RuntimeProcessStateSchema, type RuntimeLifecycleReceipt, type RuntimeProcessState } from "../runtime-engine/types.js";
import { appendRuntimeResourceUsage, type RuntimeResourceUsage, type RuntimeResourceUsageInput } from "./resource-ledger.js";

export type RuntimeResourceCall = {
  callId: string;
  sessionId: string;
  taskId?: string;
  agent: string;
  route: ProviderRoute;
  usage?: Usage;
  requestLatencyMs: number;
  contextWindowTokens: number;
  failureClass?: string;
  resources?: { peakMemoryBytes?: number; peakVramBytes?: number };
};

type CaptureDeps = {
  now?: () => Date;
  selectedProfile?: () => Promise<RuntimeProfile | null>;
  latestState?: () => Promise<RuntimeProcessState | null>;
  lifecycleReceipts?: () => Promise<RuntimeLifecycleReceipt[]>;
};

async function latestRuntimeState(root: string): Promise<RuntimeProcessState | null> {
  const directory = join(root, ".vanta", "runtime-engines");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); }
  catch { return null; }
  const states: RuntimeProcessState[] = [];
  for (const name of names) {
    try { states.push(RuntimeProcessStateSchema.parse(JSON.parse(await readFile(join(directory, name), "utf8")))); }
    catch { /* a damaged state cannot hide another runtime */ }
  }
  return states.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

function routeHost(route: ProviderRoute): { id: string; local: boolean } {
  try {
    const url = new URL(route.baseRoute);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return { id: url.port ? `${url.hostname}:${url.port}` : url.hostname, local };
  } catch { return { id: route.provider, local: false }; }
}

function profileMatches(profile: RuntimeProfile | null, route: ProviderRoute): boolean {
  if (!profile) return false;
  try {
    const url = new URL(route.baseRoute);
    return url.hostname === profile.endpoint.host && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === profile.endpoint.port;
  } catch { return false; }
}

function lifecycleMetrics(receipts: RuntimeLifecycleReceipt[], runtimeId: string | undefined, now: Date): { launchLatencyMs: number | null; activeDurationMs: number | null } {
  const runtime = runtimeId ? receipts.filter((receipt) => receipt.runtimeId === runtimeId) : [];
  const starting = runtime.find((receipt) => receipt.transition === "starting");
  const healthy = runtime.find((receipt) => receipt.transition === "healthy" && (!starting || Date.parse(receipt.at) >= Date.parse(starting.at)));
  const active = [...runtime].reverse().find((receipt) => receipt.transition === "running" || receipt.transition === "recovered");
  return {
    launchLatencyMs: starting && healthy ? Math.max(0, Date.parse(healthy.at) - Date.parse(starting.at)) : null,
    activeDurationMs: active ? Math.max(0, now.getTime() - Date.parse(active.at)) : null,
  };
}

function missing(input: Omit<RuntimeResourceUsageInput, "missingTelemetry">): RuntimeResourceUsageInput["missingTelemetry"] {
  const fields = [
    ["launch_latency_ms", input.launchLatencyMs],
    ["input_tokens", input.inputTokens],
    ["output_tokens", input.outputTokens],
    ["throughput_tokens_per_second", input.throughputTokensPerSecond],
    ["peak_memory_bytes", input.peakMemoryBytes],
    ["peak_vram_bytes", input.peakVramBytes],
    ["cache_tokens", input.cacheTokens],
    ["context_tokens", input.contextTokens],
    ["context_window_tokens", input.contextWindowTokens],
    ["active_duration_ms", input.activeDurationMs],
  ] as const;
  return fields.filter(([, value]) => value === null).map(([field]) => field);
}

function artifactHash(profile: RuntimeProfile | null): string | null {
  if (!profile) return null;
  return createHash("sha256").update(`${profile.model.path}\0${profile.model.bytes}`).digest("hex");
}

function nullable<T>(value: T | undefined): T | null { return value === undefined ? null : value; }

function first<T>(...values: Array<T | undefined>): T | null {
  return values.find((value) => value !== undefined) ?? null;
}

function runtimeHostKind(profile: RuntimeProfile | null, local: boolean): "local" | "remote" {
  if (!local || profile?.backend === "vllm" || profile?.backend === "sglang") return "remote";
  return "local";
}

function throughput(outputTokens: number | null, requestLatencyMs: number): number | null {
  if (outputTokens === null || requestLatencyMs <= 0) return null;
  return Math.round(outputTokens / (requestLatencyMs / 1_000) * 10) / 10;
}

function profileVersion(profile: RuntimeProfile | null): string | null {
  return profile ? `v${profile.version}@${profile.updatedAt}` : null;
}

function failureClass(call: RuntimeResourceCall): string | null {
  if (call.failureClass) return call.failureClass;
  return call.route.fallbackDepth ? "fallback_recovered" : null;
}

type BuildInputArgs = {
  call: RuntimeResourceCall;
  profile: RuntimeProfile | null;
  state: RuntimeProcessState | null;
  receipts: RuntimeLifecycleReceipt[];
  now: Date;
};

function buildInput({ call, profile, state, receipts, now }: BuildInputArgs): Omit<RuntimeResourceUsageInput, "missingTelemetry"> {
  const host = routeHost(call.route);
  const lifecycle = lifecycleMetrics(receipts, first(state?.runtimeId, profile?.id) ?? undefined, now);
  const outputTokens = nullable(call.usage?.outputTokens);
  return {
    callId: call.callId, ts: now.toISOString(), sessionId: call.sessionId, taskId: nullable(call.taskId), agent: call.agent,
    provider: call.route.provider, billingMode: call.route.billingMode, baseRoute: call.route.baseRoute,
    controllerId: first(state?.runtimeId, profile?.id) ?? `${call.route.provider}-controller`, hostId: host.id,
    hostKind: runtimeHostKind(profile, host.local), engine: first(state?.backend, profile?.backend) ?? call.route.provider,
    model: basename(call.route.model), profileId: nullable(profile?.id), profileVersion: profileVersion(profile), artifactSha256: artifactHash(profile),
    launchLatencyMs: lifecycle.launchLatencyMs, requestLatencyMs: Math.max(0, call.requestLatencyMs), activeDurationMs: lifecycle.activeDurationMs,
    inputTokens: nullable(call.usage?.inputTokens), outputTokens, throughputTokensPerSecond: throughput(outputTokens, call.requestLatencyMs),
    peakMemoryBytes: nullable(call.resources?.peakMemoryBytes), peakVramBytes: nullable(call.resources?.peakVramBytes), cacheTokens: nullable(call.usage?.cacheTokens),
    contextTokens: first(profile?.resources.contextTokens, state?.contextTokens), contextWindowTokens: Math.max(0, call.contextWindowTokens), failureClass: failureClass(call),
  };
}

export async function captureRuntimeResourceUsage(root: string, call: RuntimeResourceCall, deps: CaptureDeps = {}): Promise<RuntimeResourceUsage | null> {
  const profile = await (deps.selectedProfile ?? (() => readSelectedRuntimeProfile(root)))();
  if (call.route.billingMode !== "local" && !profileMatches(profile, call.route)) return null;
  const state = await (deps.latestState ?? (() => latestRuntimeState(root)))();
  const receipts = await (deps.lifecycleReceipts ?? (() => readRuntimeLifecycleReceipts(root)))();
  const now = deps.now?.() ?? new Date();
  const base = buildInput({ call, profile, state, receipts, now });
  return appendRuntimeResourceUsage(join(root, ".vanta"), { ...base, missingTelemetry: missing(base) });
}

export async function recordRuntimeResourceUsage(root: string, call: RuntimeResourceCall, deps: CaptureDeps = {}): Promise<void> {
  try { await captureRuntimeResourceUsage(root, call, deps); }
  catch { /* resource telemetry must never break a provider response */ }
}
