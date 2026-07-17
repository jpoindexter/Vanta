import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { normalizeBaseRoute } from "../providers/route.js";

const MissingTelemetrySchema = z.enum([
  "launch_latency_ms",
  "input_tokens",
  "output_tokens",
  "throughput_tokens_per_second",
  "peak_memory_bytes",
  "peak_vram_bytes",
  "cache_tokens",
  "context_tokens",
  "context_window_tokens",
  "active_duration_ms",
]);

const NullableMetric = z.number().nonnegative().nullable();
export const RuntimeResourceUsageSchema = z.object({
  version: z.literal(1),
  receiptId: z.string().uuid(),
  callId: z.string().min(1).max(160),
  ts: z.string().datetime(),
  sessionId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200).nullable(),
  agent: z.string().min(1).max(120),
  provider: z.string().min(1).max(120),
  billingMode: z.enum(["metered", "included", "local", "unknown"]),
  baseRoute: z.string().min(1).max(500),
  controllerId: z.string().min(1).max(200),
  hostId: z.string().min(1).max(200),
  hostKind: z.enum(["local", "remote"]),
  engine: z.string().min(1).max(120),
  model: z.string().min(1).max(240),
  profileId: z.string().min(1).max(120).nullable(),
  profileVersion: z.string().min(1).max(160).nullable(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  launchLatencyMs: NullableMetric,
  requestLatencyMs: z.number().nonnegative(),
  activeDurationMs: NullableMetric,
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  throughputTokensPerSecond: NullableMetric,
  peakMemoryBytes: z.number().int().nonnegative().nullable(),
  peakVramBytes: z.number().int().nonnegative().nullable(),
  cacheTokens: z.number().int().nonnegative().nullable(),
  contextTokens: z.number().int().nonnegative().nullable(),
  contextWindowTokens: z.number().int().nonnegative().nullable(),
  failureClass: z.string().min(1).max(120).nullable(),
  missingTelemetry: z.array(MissingTelemetrySchema),
}).strict();

export type RuntimeResourceUsage = z.infer<typeof RuntimeResourceUsageSchema>;
export type RuntimeResourceUsageInput = Omit<RuntimeResourceUsage, "version" | "receiptId" | "ts" | "baseRoute" | "missingTelemetry"> & {
  ts?: string;
  baseRoute: string;
  missingTelemetry: readonly z.infer<typeof MissingTelemetrySchema>[];
};
export type RuntimeResourceFilter = { taskId?: string; model?: string; hostId?: string; sessionId?: string };

const ledgerPath = (dataDir: string): string => join(dataDir, "runtime-resource-ledger.jsonl");

function safeRoute(value: string): string {
  const normalized = normalizeBaseRoute(value);
  return normalized.replace(/(token|key|secret|password)=[^&\s]+/gi, "$1=[redacted]");
}

export async function appendRuntimeResourceUsage(dataDir: string, input: RuntimeResourceUsageInput): Promise<RuntimeResourceUsage> {
  const row = RuntimeResourceUsageSchema.parse({
    ...input,
    version: 1,
    receiptId: randomUUID(),
    ts: input.ts ?? new Date().toISOString(),
    baseRoute: safeRoute(input.baseRoute),
    missingTelemetry: [...new Set(input.missingTelemetry)],
  });
  await mkdir(dataDir, { recursive: true });
  await appendFile(ledgerPath(dataDir), `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(ledgerPath(dataDir), 0o600);
  return row;
}

function matches(row: RuntimeResourceUsage, filter: RuntimeResourceFilter): boolean {
  return (!filter.taskId || row.taskId === filter.taskId)
    && (!filter.model || row.model === filter.model)
    && (!filter.hostId || row.hostId === filter.hostId)
    && (!filter.sessionId || row.sessionId === filter.sessionId);
}

export async function listRuntimeResourceUsage(dataDir: string, filter: RuntimeResourceFilter = {}): Promise<RuntimeResourceUsage[]> {
  let raw: string;
  try { raw = await readFile(ledgerPath(dataDir), "utf8"); }
  catch { return []; }
  const seen = new Set<string>();
  const rows: RuntimeResourceUsage[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = RuntimeResourceUsageSchema.safeParse(JSON.parse(line));
      if (!parsed.success || seen.has(parsed.data.callId)) continue;
      seen.add(parsed.data.callId);
      if (matches(parsed.data, filter)) rows.push(parsed.data);
    } catch { /* one corrupt row cannot hide later resource receipts */ }
  }
  return rows;
}

export type RuntimeResourceUsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  activeDurationMs: number;
  requestLatencyMs: number;
  failures: number;
  missingTelemetryCalls: number;
  byTask: Record<string, number>;
  byModel: Record<string, number>;
  byHost: Record<string, number>;
};

function increment(target: Record<string, number>, key: string): void { target[key] = (target[key] ?? 0) + 1; }

export function summarizeRuntimeResourceUsage(rows: RuntimeResourceUsage[]): RuntimeResourceUsageSummary {
  const total: RuntimeResourceUsageSummary = { calls: 0, inputTokens: 0, outputTokens: 0, activeDurationMs: 0, requestLatencyMs: 0, failures: 0, missingTelemetryCalls: 0, byTask: {}, byModel: {}, byHost: {} };
  for (const row of rows) {
    total.calls += 1;
    total.inputTokens += row.inputTokens ?? 0;
    total.outputTokens += row.outputTokens ?? 0;
    total.activeDurationMs += row.activeDurationMs ?? 0;
    total.requestLatencyMs += row.requestLatencyMs;
    if (row.failureClass) total.failures += 1;
    if (row.missingTelemetry.length) total.missingTelemetryCalls += 1;
    increment(total.byTask, row.taskId ?? "unassigned");
    increment(total.byModel, row.model);
    increment(total.byHost, row.hostId);
  }
  return total;
}

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("|") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const EXPORT_FIELDS = ["receiptId", "callId", "ts", "sessionId", "taskId", "agent", "provider", "billingMode", "baseRoute", "controllerId", "hostId", "hostKind", "engine", "model", "profileId", "profileVersion", "artifactSha256", "launchLatencyMs", "requestLatencyMs", "activeDurationMs", "inputTokens", "outputTokens", "throughputTokensPerSecond", "peakMemoryBytes", "peakVramBytes", "cacheTokens", "contextTokens", "contextWindowTokens", "failureClass", "missingTelemetry"] as const;

export function exportRuntimeResourceUsage(rows: RuntimeResourceUsage[], format: "json" | "csv"): string {
  if (format === "json") return `${JSON.stringify(rows, null, 2)}\n`;
  return `${EXPORT_FIELDS.join(",")}\n${rows.map((row) => EXPORT_FIELDS.map((field) => csv(row[field])).join(",")).join("\n")}\n`;
}

export async function pruneRuntimeResourceUsage(dataDir: string, before: string): Promise<{ removed: number; retained: number }> {
  const cutoff = Date.parse(before);
  if (!Number.isFinite(cutoff)) throw new Error("retention cutoff must be an ISO date");
  const rows = await listRuntimeResourceUsage(dataDir);
  const retained = rows.filter((row) => Date.parse(row.ts) >= cutoff);
  const path = ledgerPath(dataDir);
  await mkdir(dataDir, { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
  return { removed: rows.length - retained.length, retained: retained.length };
}
