import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeLifecycleManager, readRuntimeLifecycleReceipts } from "./manager.js";
import type { RuntimeEngineBackend, RuntimeLaunchSpec, RuntimeProcessPort } from "./types.js";

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  vi.restoreAllMocks();
});

async function proofServer(providerText = "VANTA_PROVIDER_OK"): Promise<{ port: number; prompts: string[] }> {
  const prompts: string[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const prompt = JSON.parse(raw).messages[0].content as string;
      prompts.push(prompt);
      const text = prompt.includes("RUNTIME") ? "VANTA_RUNTIME_OK" : providerText;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { completion_tokens: 3 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server unavailable");
  return { port: address.port, prompts };
}

function processPort(alive = true): RuntimeProcessPort & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; setAlive(value: boolean): void } {
  let isAlive = alive;
  return {
    start: vi.fn(async () => ({ pid: 4242 })), alive: vi.fn(async () => isAlive), stop: vi.fn(async () => { isAlive = false; }), setAlive: (value) => { isAlive = value; },
  };
}

function spec(backend: RuntimeEngineBackend, port: number, retainOnFailure = false): RuntimeLaunchSpec {
  return { id: `${backend}-proof`, backend, model: "/private/models/qwen.gguf", host: "127.0.0.1", port, contextTokens: 4096, modelBytes: 1024, availableMemoryBytes: 1024 ** 3, retainOnFailure };
}

function manager(root: string, process: RuntimeProcessPort, extra: Record<string, unknown> = {}) {
  return createRuntimeLifecycleManager({ root, process, assess: async () => ({ risk: "ask", needsHuman: true, reason: "launch" }), requestApproval: async () => true, healthAttempts: 2, healthIntervalMs: 0, ...extra });
}

describe("runtime engine lifecycle", () => {
  it("approves, launches, health-checks, benchmarks, and serves a real provider-compatible turn", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-engine-")); roots.push(root);
    const server = await proofServer();
    const process = processPort();
    const approval = vi.fn(async () => true);
    const lifecycle = createRuntimeLifecycleManager({ root, process, assess: async () => ({ risk: "ask", needsHuman: true, reason: "launch" }), requestApproval: approval, healthAttempts: 2, healthIntervalMs: 0 });
    const result = await lifecycle.launch(spec("llama_cpp", server.port));
    expect(result.state.status).toBe("running");
    expect(result.providerText).toBe("VANTA_PROVIDER_OK");
    expect(server.prompts).toEqual(["Reply with exactly VANTA_RUNTIME_OK", "Reply with exactly VANTA_PROVIDER_OK"]);
    expect(process.start).toHaveBeenCalledWith("llama-server", expect.arrayContaining(["--model", "/private/models/qwen.gguf"]));
    expect(approval).toHaveBeenCalledWith(expect.stringContaining(result.preview.commandHash), expect.objectContaining({ resource: expect.objectContaining({ fits: true }) }));
    const receipts = await readRuntimeLifecycleReceipts(root);
    expect(receipts.map((receipt) => receipt.transition)).toEqual(["previewed", "approval_requested", "approved", "starting", "healthy", "benchmarked", "provider_turn_verified", "running"]);
    expect(JSON.stringify(receipts)).not.toMatch(/private\/models|127\.0\.0\.1|llama-server/);
    expect((await lifecycle.stop(result.state.runtimeId)).status).toBe("stopped");
    expect(process.stop).toHaveBeenCalledWith(4242);
  });

  it("stops or retains a launched process after a downstream proof failure", async () => {
    const stoppedRoot = mkdtempSync(join(tmpdir(), "vanta-runtime-stop-")); roots.push(stoppedRoot);
    const retainedRoot = mkdtempSync(join(tmpdir(), "vanta-runtime-retain-")); roots.push(retainedRoot);
    const server = await proofServer("wrong");
    const stoppedProcess = processPort();
    await expect(manager(stoppedRoot, stoppedProcess).launch(spec("mlx", server.port))).rejects.toThrow("provider_turn_mismatch");
    expect(stoppedProcess.stop).toHaveBeenCalledWith(4242);
    const retainedProcess = processPort();
    await expect(manager(retainedRoot, retainedProcess).launch(spec("mlx", server.port, true))).rejects.toThrow("provider_turn_mismatch");
    expect(retainedProcess.stop).not.toHaveBeenCalled();
    expect((await readRuntimeLifecycleReceipts(retainedRoot)).at(-1)?.transition).toBe("retained_after_failure");
  });

  it("recovers a live process and marks a missing process stale after manager restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-recover-")); roots.push(root);
    const server = await proofServer();
    const process = processPort();
    await manager(root, process).launch(spec("llama_cpp", server.port));
    expect((await manager(root, process).recover())[0]?.status).toBe("running");
    process.setAlive(false);
    expect((await manager(root, process).recover())[0]?.status).toBe("failed");
    expect((await readRuntimeLifecycleReceipts(root)).at(-1)?.transition).toBe("stale_process");
  });

  it.each(["vllm", "sglang"] as const)("passes the same contract fixture for remote %s without marking it production-supported", async (backend) => {
    const root = mkdtempSync(join(tmpdir(), `vanta-runtime-${backend}-`)); roots.push(root);
    const server = await proofServer();
    const lifecycle = manager(root, processPort(), { enableContractOnly: true });
    expect(lifecycle.preview(spec(backend, server.port))).toMatchObject({ location: "remote", support: "contract_only" });
    expect((await lifecycle.launch(spec(backend, server.port))).state.status).toBe("running");
  });

  it("fails closed for resource pressure, kernel block, denied approval, and contract-only remote launch", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-runtime-gates-")); roots.push(root);
    const process = processPort();
    const lowMemory = { ...spec("llama_cpp", 8181), availableMemoryBytes: 1 };
    await expect(manager(root, process).launch(lowMemory)).rejects.toThrow("resource_fit");
    const blocked = createRuntimeLifecycleManager({ root, process, assess: async () => ({ risk: "block", needsHuman: false, reason: "no" }), requestApproval: async () => true });
    await expect(blocked.launch(spec("llama_cpp", 8181))).rejects.toThrow("kernel_blocked");
    const denied = createRuntimeLifecycleManager({ root, process, assess: async () => ({ risk: "ask", needsHuman: true, reason: "ask" }), requestApproval: async () => false });
    await expect(denied.launch(spec("llama_cpp", 8181))).rejects.toThrow("approval_denied");
    await expect(manager(root, process).launch(spec("vllm", 8181))).rejects.toThrow("contract_only");
    expect(process.start).not.toHaveBeenCalled();
  });
});
