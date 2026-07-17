import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { desktopRuntimePayload, selectDesktopRuntimeHost, type DesktopRuntimeSessionState } from "./runtime-controller.js";

describe("desktop runtime controller", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

  async function fixture(): Promise<{ root: string; model: string }> {
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-runtime-"));
    roots.push(root);
    const directory = join(root, ".vanta", "runtime-engines");
    const model = join(root, "private", "qwen.gguf");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "local.json"), JSON.stringify({
      version: 1,
      runtimeId: "local",
      backend: "llama_cpp",
      model,
      host: "127.0.0.1",
      port: 8899,
      contextTokens: 2048,
      modelBytes: 8_000_000_000,
      availableMemoryBytes: 32_000_000_000,
      retainOnFailure: false,
      commandHash: "a".repeat(64),
      pid: 123,
      status: "running",
      updatedAt: new Date().toISOString(),
    }));
    await writeFile(join(directory, "receipts.jsonl"), `${JSON.stringify({
      version: 1,
      runtimeId: "local",
      backend: "llama_cpp",
      at: new Date().toISOString(),
      transition: "provider_turn_verified",
      commandHash: "a".repeat(64),
      metrics: { latencyMs: 500, outputTokens: 5 },
    })}\n`);
    return { root, model };
  }

  it("normalizes a local engine into a redacted controller snapshot", async () => {
    const { root, model } = await fixture();
    const state: DesktopRuntimeSessionState = { root, sessionId: "session-a", queueDepth: 1 };
    const payload = await desktopRuntimePayload(state, {
      env: { VANTA_KERNEL_URL: "http://127.0.0.1:7788" },
      fetch: async () => new Response(JSON.stringify({ status: "ready", root }), { status: 200 }),
      memory: () => ({ used: 12_000_000_000, total: 32_000_000_000 }),
    });

    expect(payload.selectedHostId).toBe("local");
    expect(payload.hosts[0]).toMatchObject({
      host: { id: "local", label: "Local Mac", kind: "local" },
      status: "running",
      transport: "reachable",
      kernel: "ready",
      engine: { id: "llama_cpp", model: basename(model), lifecycle: "running" },
      resources: { memoryUsedBytes: 12_000_000_000, memoryTotalBytes: 32_000_000_000, throughputPerSecond: 10 },
      queueDepth: 1,
    });
    expect(JSON.stringify(payload)).not.toContain(root);
  });

  it("keeps host selection scoped to the active desktop session", async () => {
    const { root } = await fixture();
    const state: DesktopRuntimeSessionState = { root, sessionId: "session-a" };
    const env = {
      VANTA_RUNTIME_HOSTS: JSON.stringify([{ id: "remote-a", label: "Remote A", kind: "remote", endpoint: "https://runtime.example" }]),
    };
    const fetch = async (input: string | URL | Request) => {
      if (String(input).includes("runtime.example")) return new Response(JSON.stringify({
        observedAt: new Date().toISOString(), epoch: "remote-1", sequence: 4, transport: "reachable", kernel: "ready",
        engine: { id: "vllm", lifecycle: "idle" }, resources: {}, queueDepth: 0,
      }), { status: 200 });
      return new Response(JSON.stringify({ status: "ready", root }), { status: 200 });
    };

    const selected = await selectDesktopRuntimeHost(state, "remote-a", { env, fetch });
    expect(selected.selectedHostId).toBe("remote-a");
    state.sessionId = "session-b";
    expect((await desktopRuntimePayload(state, { env, fetch })).selectedHostId).toBe("local");
    state.sessionId = "session-a";
    expect((await desktopRuntimePayload(state, { env, fetch })).selectedHostId).toBe("remote-a");
    await expect(selectDesktopRuntimeHost(state, "missing", { env, fetch })).rejects.toThrow("unknown runtime host");
  });
});
