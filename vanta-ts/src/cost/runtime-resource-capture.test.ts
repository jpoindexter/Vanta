import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeProfile } from "../runtime-engine/profile-contract.js";
import { listRuntimeResourceUsage } from "./resource-ledger.js";
import { captureRuntimeResourceUsage } from "./runtime-resource-capture.js";

describe("runtime resource capture", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-resource-capture-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("records a local served call with profile and lifecycle attribution", async () => {
    const profile = createRuntimeProfile({ id: "coding", name: "Coding", backend: "llama_cpp", modelPath: "/private/models/qwen.gguf", modelBytes: 100, availableMemoryBytes: 1_000, port: 11434 });
    const now = new Date("2026-07-17T10:00:01.000Z");
    const saved = await captureRuntimeResourceUsage(root, {
      callId: "call-1", sessionId: "session-1", taskId: "task-1", agent: "interactive",
      route: { provider: "ollama", model: "qwen", baseRoute: "http://127.0.0.1:11434/v1", billingMode: "local" },
      usage: { inputTokens: 20, outputTokens: 10 }, requestLatencyMs: 200, contextWindowTokens: 8_192,
    }, {
      now: () => now,
      selectedProfile: async () => profile,
      latestState: async () => ({ version: 1, runtimeId: "coding", backend: "llama_cpp", model: profile.model.path, host: "127.0.0.1", port: 11434, contextTokens: 8_192, modelBytes: 100, availableMemoryBytes: 1_000, retainOnFailure: false, commandHash: "a".repeat(64), status: "running", updatedAt: now.toISOString() }),
      lifecycleReceipts: async () => [
        { version: 1, runtimeId: "coding", backend: "llama_cpp", at: "2026-07-17T10:00:00.000Z", transition: "starting", commandHash: "a".repeat(64) },
        { version: 1, runtimeId: "coding", backend: "llama_cpp", at: "2026-07-17T10:00:00.300Z", transition: "healthy", commandHash: "a".repeat(64) },
        { version: 1, runtimeId: "coding", backend: "llama_cpp", at: "2026-07-17T10:00:00.400Z", transition: "running", commandHash: "a".repeat(64) },
      ],
    });
    expect(saved).toMatchObject({ controllerId: "coding", hostId: "127.0.0.1:11434", hostKind: "local", engine: "llama_cpp", profileId: "coding", launchLatencyMs: 300, activeDurationMs: 600, throughputTokensPerSecond: 50 });
    expect(saved?.model).toBe("qwen");
    expect(saved?.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved?.missingTelemetry).toEqual(["peak_memory_bytes", "peak_vram_bytes", "cache_tokens"]);
    expect(await listRuntimeResourceUsage(join(root, ".vanta"))).toHaveLength(1);
  });

  it("records failed local calls and skips unrelated metered providers", async () => {
    const local = await captureRuntimeResourceUsage(root, {
      callId: "failed", sessionId: "s", agent: "gateway", route: { provider: "lmstudio", model: "local-model", baseRoute: "http://localhost:1234/v1", billingMode: "local" },
      requestLatencyMs: 50, contextWindowTokens: 4_096, failureClass: "provider_transport_failed",
    });
    const hosted = await captureRuntimeResourceUsage(root, {
      callId: "hosted", sessionId: "s", agent: "gateway", route: { provider: "openai", model: "gpt", baseRoute: "https://api.openai.com/v1", billingMode: "metered" },
      requestLatencyMs: 50, contextWindowTokens: 4_096,
    });
    expect(local).toMatchObject({ failureClass: "provider_transport_failed", inputTokens: null, outputTokens: null });
    expect(hosted).toBeNull();
  });
});
