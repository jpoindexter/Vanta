import { freemem, totalmem } from "node:os";
import { basename, join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { createRuntimeControllerAdapter } from "../runtime-controller/adapter.js";
import {
  RuntimeHostConfigSchema,
  RuntimeObservationSchema,
  type RuntimeControllerSnapshot,
  type RuntimeControllerTransport,
  type RuntimeHostConfig,
  type RuntimeObservation,
} from "../runtime-controller/types.js";
import { readRuntimeLifecycleReceipts } from "../runtime-engine/manager.js";
import { RuntimeProcessStateSchema, type RuntimeProcessState } from "../runtime-engine/types.js";

export type DesktopRuntimeSessionState = {
  root: string;
  sessionId?: string;
  queueDepth?: number;
  runtimeHostBySession?: Record<string, string>;
};

export type DesktopRuntimePayload = {
  selectedHostId: string;
  hosts: RuntimeControllerSnapshot[];
};

type DesktopRuntimeDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  memory?: () => { used: number; total: number };
  now?: () => Date;
};

const LOCAL_HOST: RuntimeHostConfig = {
  id: "local",
  label: "Local Mac",
  kind: "local",
  endpoint: "http://127.0.0.1",
  authRequired: false,
};

function configuredHosts(env: Record<string, string | undefined>): RuntimeHostConfig[] {
  const raw = env.VANTA_RUNTIME_HOSTS;
  if (!raw) return [LOCAL_HOST];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [LOCAL_HOST];
    const remote = parsed.map((host) => RuntimeHostConfigSchema.parse(host)).filter((host) => host.id !== LOCAL_HOST.id);
    return [LOCAL_HOST, ...remote];
  } catch {
    return [LOCAL_HOST];
  }
}

async function latestRuntimeState(root: string): Promise<RuntimeProcessState | null> {
  const directory = join(root, ".vanta", "runtime-engines");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); }
  catch { return null; }
  const states: RuntimeProcessState[] = [];
  for (const name of names) {
    try {
      states.push(RuntimeProcessStateSchema.parse(JSON.parse(await readFile(join(directory, name), "utf8"))));
    } catch {
      // A damaged state file cannot hide the remaining runtime observations.
    }
  }
  return states.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

function lifecycleFor(state: RuntimeProcessState | null): RuntimeObservation["engine"]["lifecycle"] {
  if (!state || state.status === "stopped") return "idle";
  return state.status;
}

async function kernelReady(root: string, env: Record<string, string | undefined>, fetcher: typeof globalThis.fetch): Promise<boolean> {
  const base = env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  try {
    const response = await fetcher(`${base.replace(/\/$/, "")}/api/status`, { signal: AbortSignal.timeout(750) });
    if (!response.ok) return false;
    const status = await response.json() as { status?: string; root?: string };
    return status.status === "ready" && status.root === root;
  } catch {
    return false;
  }
}

async function throughput(root: string, runtimeId: string | undefined): Promise<number | undefined> {
  if (!runtimeId) return undefined;
  const receipt = (await readRuntimeLifecycleReceipts(root))
    .filter((entry) => entry.runtimeId === runtimeId && entry.transition === "provider_turn_verified")
    .at(-1);
  const latency = receipt?.metrics?.latencyMs;
  const output = receipt?.metrics?.outputTokens;
  if (!latency || output === undefined) return undefined;
  return Math.round(output / (latency / 1_000) * 10) / 10;
}

function localObservation(options: {
  root: string;
  state: RuntimeProcessState | null;
  queueDepth: number;
  kernel: boolean;
  memory: { used: number; total: number };
  throughput?: number;
  now: Date;
}): RuntimeObservation {
  const { state, memory } = options;
  const utilization = memory.total > 0 ? Math.min(100, Math.max(0, memory.used / memory.total * 100)) : undefined;
  return RuntimeObservationSchema.parse({
    observedAt: options.now.toISOString(),
    epoch: state?.pid ? `pid-${state.pid}` : "local-idle",
    sequence: options.now.getTime(),
    transport: "reachable",
    kernel: options.kernel ? "ready" : "not_ready",
    engine: {
      ...(state ? { id: state.backend, model: basename(state.model) } : {}),
      lifecycle: lifecycleFor(state),
    },
    resources: {
      memoryUsedBytes: Math.max(0, Math.round(memory.used)),
      memoryTotalBytes: Math.max(1, Math.round(memory.total)),
      ...(utilization === undefined ? {} : { utilizationPercent: utilization }),
      ...(options.throughput === undefined ? {} : { throughputPerSecond: options.throughput }),
    },
    queueDepth: options.queueDepth,
  });
}

function remoteStatusUrl(endpoint: string): string {
  return new URL("/api/runtime-controller/status", endpoint).toString();
}

function desktopTransport(state: DesktopRuntimeSessionState, deps: Required<Pick<DesktopRuntimeDeps, "fetch" | "memory" | "now">> & { env: Record<string, string | undefined> }): RuntimeControllerTransport {
  return {
    async inspect(host, credential) {
      if (host.kind === "local") {
        const engine = await latestRuntimeState(state.root);
        return localObservation({
          root: state.root,
          state: engine,
          queueDepth: Math.max(0, state.queueDepth ?? 0),
          kernel: await kernelReady(state.root, deps.env, deps.fetch),
          memory: deps.memory(),
          throughput: await throughput(state.root, engine?.runtimeId),
          now: deps.now(),
        });
      }
      const response = await deps.fetch(remoteStatusUrl(host.endpoint), {
        headers: credential ? { authorization: `Bearer ${credential}` } : undefined,
        signal: AbortSignal.timeout(1_500),
      });
      if (response.status === 401 || response.status === 403) {
        return RuntimeObservationSchema.parse({
          observedAt: deps.now().toISOString(), epoch: "remote-auth", sequence: 0, transport: "auth_required",
          kernel: "unknown", engine: { lifecycle: "idle" }, resources: {}, queueDepth: 0,
        });
      }
      if (!response.ok) throw new Error("runtime controller unavailable");
      return RuntimeObservationSchema.parse(await response.json());
    },
    async *stream(host, credential) {
      yield await this.inspect(host, credential);
    },
  };
}

function runtimeAdapter(state: DesktopRuntimeSessionState, input: DesktopRuntimeDeps) {
  const env = input.env ?? process.env;
  const fetcher = input.fetch ?? globalThis.fetch;
  const memory = input.memory ?? (() => ({ used: totalmem() - freemem(), total: totalmem() }));
  const now = input.now ?? (() => new Date());
  const hosts = configuredHosts(env);
  return {
    hosts,
    adapter: createRuntimeControllerAdapter({
      hosts,
      transport: desktopTransport(state, { env, fetch: fetcher, memory, now }),
      resolveCredential: async (reference) => env[reference],
      now: () => now().getTime(),
    }),
  };
}

export async function desktopRuntimePayload(state: DesktopRuntimeSessionState, deps: DesktopRuntimeDeps = {}): Promise<DesktopRuntimePayload> {
  const { hosts, adapter } = runtimeAdapter(state, deps);
  const snapshots = await adapter.discover();
  const session = state.sessionId ?? "default";
  const requested = state.runtimeHostBySession?.[session];
  const selectedHostId = hosts.some((host) => host.id === requested) ? requested! : LOCAL_HOST.id;
  return { selectedHostId, hosts: snapshots };
}

export async function selectDesktopRuntimeHost(state: DesktopRuntimeSessionState, hostId: string, deps: DesktopRuntimeDeps = {}): Promise<DesktopRuntimePayload> {
  const { hosts } = runtimeAdapter(state, deps);
  if (!hosts.some((host) => host.id === hostId)) throw new Error(`unknown runtime host: ${hostId}`);
  const session = state.sessionId ?? "default";
  state.runtimeHostBySession = { ...state.runtimeHostBySession, [session]: hostId };
  return desktopRuntimePayload(state, deps);
}
