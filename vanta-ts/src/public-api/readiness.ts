import { open, readdir, statfs } from "node:fs/promises";
import { join } from "node:path";
import { createKernelClient } from "../kernel/client.js";
import { providerById } from "../providers/catalog.js";
import { MESSAGING_CATALOG } from "../gateway/platforms/registry.js";
import { readGatewayReadiness } from "../gateway/readiness-state.js";
import type { SessionMap } from "../desktop/session-state.js";

type Status = "ok" | "degraded";
type DiskStat = { bavail: number; blocks: number; bsize: number };
export type ReadinessDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  kernelStatus?: () => Promise<boolean>;
  diskStat?: (path: string) => Promise<DiskStat>;
};

export type RuntimeReadiness = {
  apiVersion: "v1";
  status: "ready" | "degraded";
  checks: {
    kernel: { status: Status };
    provider: { status: Status; configured: number };
    stores: { status: Status; checked: number; corrupt: number };
    disk: { status: Status; freePercent: number };
    gateway: { status: Status | "idle" | "unknown"; configured: number; up: number; down: number; stale: number };
    activity: { status: "ok"; activeTurns: number; backgroundRunning: number; backgroundCompleted: number; delegatedWorkers: number; delegationCompletions: number };
  };
};

const MAX_ENTRIES = 200;
const MAX_FILE_BYTES = 1_000_000;
const timeout = async <T>(task: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([task, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

async function boundedText(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (info.size > MAX_FILE_BYTES) throw Object.assign(new Error("bounded readiness file limit"), { code: "EFBIG" });
    const buffer = Buffer.alloc(info.size);
    await file.read(buffer, 0, info.size, 0);
    return buffer.toString("utf8");
  } finally { await file.close(); }
}

async function jsonFiles(dir: string): Promise<{ checked: number; corrupt: number; values: unknown[] }> {
  let names: string[];
  try { names = (await readdir(dir)).filter((name) => name.endsWith(".json")).slice(0, MAX_ENTRIES); }
  catch { return { checked: 0, corrupt: 0, values: [] }; }
  const values: unknown[] = []; let corrupt = 0;
  for (const name of names) {
    try { values.push(JSON.parse(await boundedText(join(dir, name)))); }
    catch { corrupt += 1; }
  }
  return { checked: names.length, corrupt, values };
}

async function jsonFile(path: string): Promise<{ checked: number; corrupt: number; value?: unknown }> {
  try { return { checked: 1, corrupt: 0, value: JSON.parse(await boundedText(path)) }; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { checked: 0, corrupt: 0 } : { checked: 1, corrupt: 1 }; }
}

async function jsonLines(path: string): Promise<{ checked: number; corrupt: number }> {
  let raw: string;
  try { raw = await boundedText(path); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { checked: 0, corrupt: 0 } : { checked: 1, corrupt: 1 }; }
  const lines = raw.split("\n").filter(Boolean).slice(0, MAX_ENTRIES); let corrupt = 0;
  for (const line of lines) { try { JSON.parse(line); } catch { corrupt += 1; } }
  return { checked: lines.length, corrupt };
}

function providerConfigured(env: NodeJS.ProcessEnv): boolean {
  const id = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  if (id === "custom") return Boolean(env.VANTA_OPENAI_BASE_URL?.trim());
  if (id === "azure") return ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_API_KEY"].every((key) => env[key]?.trim());
  const entry = providerById(id);
  return Boolean(entry && (!entry.envVar || env[entry.envVar]?.trim()));
}

export async function collectRuntimeReadiness(root: string, home: string, sessions: SessionMap, deps: ReadinessDeps = {}): Promise<RuntimeReadiness> {
  const env = deps.env ?? process.env, now = deps.now?.() ?? Date.now(), dataDir = join(root, ".vanta");
  const kernelTask = deps.kernelStatus?.() ?? createKernelClient(env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788").status();
  const [kernelOk, sessionStore, bgStore, agentStore, delegationStore, gateway, disk] = await Promise.all([
    timeout(kernelTask, 750, false), jsonFiles(join(home, "sessions")), jsonFiles(join(dataDir, "bg-tasks")),
    jsonFile(join(dataDir, "agent-sessions.json")), jsonLines(join(dataDir, "async-delegate.jsonl")),
    readGatewayReadiness(dataDir), (deps.diskStat ?? statfs)(root).catch(() => ({ bavail: 0, blocks: 0, bsize: 0 })),
  ]);
  const corrupt = sessionStore.corrupt + bgStore.corrupt + agentStore.corrupt + delegationStore.corrupt;
  const freePercent = disk.blocks > 0 ? Math.max(0, Math.min(100, Math.floor((disk.bavail / disk.blocks) * 100))) : 0;
  const lowDisk = freePercent < 5 || disk.bavail * disk.bsize < 2 * 1024 ** 3;
  const configured = MESSAGING_CATALOG.filter((item) => item.requiredEnv.every((key) => env[key]?.trim())).length;
  const stale = gateway && now - Date.parse(gateway.updatedAt) > 180_000 ? 1 : 0;
  const up = stale ? 0 : gateway?.channels.filter((channel) => channel.status === "up").length ?? 0;
  const down = stale ? 0 : gateway?.channels.filter((channel) => channel.status === "down").length ?? 0;
  const bgValues = bgStore.values.filter((value): value is { status: string } => Boolean(value && typeof value === "object" && "status" in value));
  const workers = Array.isArray(agentStore.value) ? agentStore.value.length : 0;
  const providerOk = providerConfigured(env), storesOk = corrupt === 0;
  const gatewayStatus = configured === 0 ? "idle" : !gateway || stale ? "unknown" : down ? "degraded" : "ok";
  const ready = kernelOk && providerOk && storesOk && !lowDisk && gatewayStatus !== "degraded" && gatewayStatus !== "unknown";
  return {
    apiVersion: "v1", status: ready ? "ready" : "degraded",
    checks: {
      kernel: { status: kernelOk ? "ok" : "degraded" },
      provider: { status: providerOk ? "ok" : "degraded", configured: providerOk ? 1 : 0 },
      stores: { status: storesOk ? "ok" : "degraded", checked: sessionStore.checked + bgStore.checked + agentStore.checked + delegationStore.checked, corrupt },
      disk: { status: lowDisk ? "degraded" : "ok", freePercent },
      gateway: { status: gatewayStatus, configured, up, down, stale },
      activity: { status: "ok", activeTurns: [...sessions.values()].filter((state) => state._chatActive).length, backgroundRunning: bgValues.filter((v) => v.status === "running").length, backgroundCompleted: bgValues.filter((v) => v.status === "done" || v.status === "failed").length, delegatedWorkers: workers, delegationCompletions: Math.max(0, delegationStore.checked - delegationStore.corrupt) },
    },
  };
}
