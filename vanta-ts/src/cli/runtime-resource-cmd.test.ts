import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRuntimeResourceUsage, listRuntimeResourceUsage } from "../cost/resource-ledger.js";
import { runRuntimeResourceCommand } from "./runtime-resource-cmd.js";

const fixture = {
  callId: "call-1", sessionId: "session-1", taskId: "task-1", agent: "desktop", provider: "ollama", billingMode: "local" as const,
  baseRoute: "http://127.0.0.1:11434/v1", controllerId: "local", hostId: "127.0.0.1:11434", hostKind: "local" as const,
  engine: "llama_cpp", model: "qwen", profileId: null, profileVersion: null, artifactSha256: null,
  launchLatencyMs: null, requestLatencyMs: 200, activeDurationMs: null, inputTokens: 20, outputTokens: 10,
  throughputTokensPerSecond: 50, peakMemoryBytes: null, peakVramBytes: null, cacheTokens: null,
  contextTokens: null, contextWindowTokens: 8_192, failureClass: null,
  missingTelemetry: ["launch_latency_ms", "peak_memory_bytes", "peak_vram_bytes", "cache_tokens", "context_tokens", "active_duration_ms"] as const,
};

describe("runtime resource usage command", () => {
  let root: string;
  let lines: string[];
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-resource-cli-")); lines = []; await appendRuntimeResourceUsage(join(root, ".vanta"), fixture); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("lists and summarizes filtered resource rows", async () => {
    expect(await runRuntimeResourceCommand(root, ["list", "--task", "task-1", "--json"], { log: (line) => lines.push(line) })).toBe(0);
    expect(JSON.parse(lines.pop() ?? "[]")).toHaveLength(1);
    expect(await runRuntimeResourceCommand(root, ["summary", "--host", "127.0.0.1:11434", "--json"], { log: (line) => lines.push(line) })).toBe(0);
    expect(JSON.parse(lines.pop() ?? "{}")).toMatchObject({ calls: 1, inputTokens: 20, outputTokens: 10 });
  });

  it("exports CSV and requires confirmation before retention pruning", async () => {
    const out = join(root, "usage.csv");
    expect(await runRuntimeResourceCommand(root, ["export", "--format", "csv", "--out", out], { log: (line) => lines.push(line) })).toBe(0);
    expect(await readFile(out, "utf8")).toContain("receiptId,callId,ts");
    expect(await runRuntimeResourceCommand(root, ["prune", "--before", "2099-01-01T00:00:00.000Z"], { log: (line) => lines.push(line) })).toBe(1);
    expect(await listRuntimeResourceUsage(join(root, ".vanta"))).toHaveLength(1);
    expect(await runRuntimeResourceCommand(root, ["prune", "--before", "2099-01-01T00:00:00.000Z", "--confirm"], { log: (line) => lines.push(line) })).toBe(0);
    expect(await listRuntimeResourceUsage(join(root, ".vanta"))).toHaveLength(0);
  });
});
