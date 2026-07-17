import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeLifecycleManager, RuntimeLaunchSpec, RuntimeProcessState } from "../runtime-engine/types.js";
import { createFirstInferenceWizard, readFirstInferenceReceipts } from "./wizard.js";
import type { FirstInferenceHardware } from "./types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const bytes = Buffer.from("model");
const model = { id: "tiny", label: "Tiny", url: "https://models.test/tiny.gguf", sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, filename: "tiny.gguf", contextTokens: 512 };
const hardware: FirstInferenceHardware = { platform: "darwin", architecture: "arm64", memoryBytes: 16 * 1024 ** 3, freeDiskBytes: 20 * 1024 ** 3, runtimeAvailable: true, supported: true, reason: "ready" };

function lifecycle(running = false): RuntimeLifecycleManager & { launch: ReturnType<typeof vi.fn>; recover: ReturnType<typeof vi.fn> } {
  let state: RuntimeProcessState = { version: 1, runtimeId: "local-model-first-runtime", backend: "llama_cpp", model: "/tmp/tiny.gguf", host: "127.0.0.1", port: 8127, contextTokens: 512, modelBytes: bytes.length, availableMemoryBytes: 10 * 1024 ** 3, retainOnFailure: true, commandHash: "a".repeat(64), pid: 42, status: "running", updatedAt: "2026-07-17T00:00:00.000Z" };
  return {
    preview: (spec: RuntimeLaunchSpec) => ({ runtimeId: spec.id, backend: spec.backend, location: "local", support: "supported", command: "llama-server", args: [], endpoint: `http://${spec.host}:${spec.port}`, commandHash: "a".repeat(64), resource: { estimatedMemoryBytes: 1, availableMemoryBytes: spec.availableMemoryBytes, headroomBytes: 1, fits: true }, approvalAction: "launch" }),
    launch: vi.fn(async (spec: RuntimeLaunchSpec) => ({ state: { ...state, model: spec.model }, preview: {} as never, benchmark: { latencyMs: 1, outputTokens: 1 }, providerText: "VANTA_PROVIDER_OK" })),
    stop: vi.fn(async () => ({ ...state, status: "stopped" as const })),
    recover: vi.fn(async () => running ? [state] : []),
  };
}

function wizard(root: string, runtime = lifecycle(), overrides: Record<string, unknown> = {}) {
  return createFirstInferenceWizard({
    root, model, lifecycle: runtime, detectHardware: async () => hardware,
    download: async ({ destination, onProgress }) => { await mkdir(join(root, ".vanta", "models"), { recursive: true }); await writeFile(destination, bytes); await onProgress?.(bytes.length, 0); return { path: destination, resumedAt: 0 }; },
    fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: "Sort the tasks by urgency, then complete the smallest urgent task first." } }] }), { status: 200 }),
    now: () => new Date("2026-07-17T00:00:00.000Z"), ...overrides,
  });
}

describe("first-inference wizard", () => {
  it("goes from clean hardware to one useful local result with redacted receipts", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-wizard-")); roots.push(root);
    const runtime = lifecycle();
    const result = await wizard(root, runtime).run();
    expect(result.checkpoint.status).toBe("done");
    expect(result.response).toContain("urgency");
    expect(runtime.launch).toHaveBeenCalledOnce();
    const receipts = await readFirstInferenceReceipts(root);
    expect(receipts.map((receipt) => receipt.transition)).toEqual(expect.arrayContaining(["downloading", "downloaded", "launching", "running", "task_verified", "done"]));
    expect(receipts.find((receipt) => receipt.responseSha256)?.responseSha256).toHaveLength(64);
    expect(JSON.stringify(receipts)).not.toMatch(/models\.test|Sort the tasks|\.gguf/);
  });

  it("resumes from a live runtime after restart without launching twice", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-resume-")); roots.push(root);
    const runtime = lifecycle(true);
    const first = wizard(root, runtime);
    await first.prepare();
    const result = await first.run();
    expect(result.checkpoint.status).toBe("done");
    expect(runtime.recover).toHaveBeenCalled();
    expect(runtime.launch).not.toHaveBeenCalled();
  });

  it.each([
    ["low_disk", { ...hardware, freeDiskBytes: 1 }],
    ["unsupported_platform", { ...hardware, platform: "linux", supported: false, reason: "unsupported_platform" as const }],
  ])("classifies %s before download or launch", async (code, detected) => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-gate-")); roots.push(root);
    const runtime = lifecycle();
    await expect(wizard(root, runtime, { detectHardware: async () => detected }).run()).rejects.toThrow(code);
    expect(runtime.launch).not.toHaveBeenCalled();
  });

  it("persists cancellation and permits a later retry", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-retry-")); roots.push(root);
    const runtime = lifecycle();
    const cancelled = wizard(root, runtime, { download: async () => { throw new Error("cancelled"); } });
    await expect(cancelled.run()).rejects.toThrow("cancelled");
    expect((await cancelled.status())?.status).toBe("cancelled");
    expect((await wizard(root, runtime).run()).checkpoint.status).toBe("done");
  });

  it("classifies failed launch and preserves a retryable checkpoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-launch-")); roots.push(root);
    const runtime = lifecycle();
    runtime.launch.mockRejectedValueOnce(new Error("health_timeout"));
    const first = wizard(root, runtime);
    await expect(first.run()).rejects.toThrow("health_timeout");
    expect(await first.status()).toEqual(expect.objectContaining({ status: "failed", failureCode: "health_timeout" }));
  });
});
