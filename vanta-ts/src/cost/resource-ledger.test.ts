import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRuntimeResourceUsage,
  exportRuntimeResourceUsage,
  listRuntimeResourceUsage,
  pruneRuntimeResourceUsage,
  summarizeRuntimeResourceUsage,
} from "./resource-ledger.js";

const row = {
  callId: "call-1",
  sessionId: "session-1",
  taskId: "task-1",
  agent: "interactive",
  provider: "ollama",
  billingMode: "local" as const,
  baseRoute: "http://127.0.0.1:11434/v1?token=secret",
  controllerId: "local-controller",
  hostId: "127.0.0.1:11434",
  hostKind: "local" as const,
  engine: "llama_cpp",
  model: "qwen.gguf",
  profileId: "coding",
  profileVersion: "v2@2026-07-17T10:00:00.000Z",
  artifactSha256: "a".repeat(64),
  launchLatencyMs: 500,
  requestLatencyMs: 200,
  activeDurationMs: 4_000,
  inputTokens: 20,
  outputTokens: 10,
  throughputTokensPerSecond: 50,
  peakMemoryBytes: null,
  peakVramBytes: null,
  cacheTokens: null,
  contextTokens: 8_192,
  contextWindowTokens: 8_192,
  failureClass: null,
  missingTelemetry: ["peak_memory_bytes", "peak_vram_bytes", "cache_tokens"] as const,
};

describe("runtime resource usage ledger", () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await mkdtemp(join(tmpdir(), "vanta-resource-ledger-")); });
  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  it("persists mode-0600 rows with explicit missing telemetry and no billed cost field", async () => {
    const saved = await appendRuntimeResourceUsage(dataDir, row);
    const rows = await listRuntimeResourceUsage(dataDir);
    expect(rows).toEqual([saved]);
    expect(saved.missingTelemetry).toEqual(["peak_memory_bytes", "peak_vram_bytes", "cache_tokens"]);
    expect(saved).not.toHaveProperty("costUsd");
    expect(JSON.stringify(saved)).not.toContain("token=secret");
    expect((await stat(join(dataDir, "runtime-resource-ledger.jsonl"))).mode & 0o777).toBe(0o600);
  });

  it("filters and aggregates by task, model, and host without hiding missing data", async () => {
    await appendRuntimeResourceUsage(dataDir, row);
    await appendRuntimeResourceUsage(dataDir, { ...row, callId: "call-2", taskId: "task-2", model: "other.gguf", hostId: "remote:8000", hostKind: "remote", requestLatencyMs: 400, outputTokens: 20, throughputTokensPerSecond: 50 });
    expect(await listRuntimeResourceUsage(dataDir, { taskId: "task-1" })).toHaveLength(1);
    expect(await listRuntimeResourceUsage(dataDir, { model: "other.gguf", hostId: "remote:8000" })).toHaveLength(1);
    expect(summarizeRuntimeResourceUsage(await listRuntimeResourceUsage(dataDir))).toMatchObject({ calls: 2, inputTokens: 40, outputTokens: 30, activeDurationMs: 8_000, missingTelemetryCalls: 2 });
  });

  it("exports redacted JSON and CSV and prunes expired rows", async () => {
    await appendRuntimeResourceUsage(dataDir, { ...row, callId: "old", ts: "2026-07-01T00:00:00.000Z" });
    await appendRuntimeResourceUsage(dataDir, { ...row, callId: "new", ts: "2026-07-17T00:00:00.000Z" });
    const rows = await listRuntimeResourceUsage(dataDir);
    expect(exportRuntimeResourceUsage(rows, "json")).toContain("old");
    expect(exportRuntimeResourceUsage(rows, "csv")).toContain("receiptId,callId,ts,sessionId,taskId");
    expect(exportRuntimeResourceUsage(rows, "csv")).not.toContain("token=secret");
    expect(await pruneRuntimeResourceUsage(dataDir, "2026-07-10T00:00:00.000Z")).toEqual({ removed: 1, retained: 1 });
  });

  it("keeps persistence overhead bounded", async () => {
    const started = performance.now();
    for (let index = 0; index < 40; index++) await appendRuntimeResourceUsage(dataDir, { ...row, callId: `call-${index}` });
    expect(performance.now() - started).toBeLessThan(1_500);
  });
});
