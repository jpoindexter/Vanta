import { stat } from "node:fs/promises";
import { totalmem } from "node:os";
import { resolve } from "node:path";
import { createKernelClient } from "../src/kernel/client.js";
import { kernelBinaryPath } from "../src/kernel/path.js";
import { ensureKernel } from "../src/kernel-launcher.js";
import { createRuntimeLifecycleManager, readRuntimeLifecycleReceipts } from "../src/runtime-engine/manager.js";

const model = process.env.VANTA_RUNTIME_MODEL;
if (!model) throw new Error("set VANTA_RUNTIME_MODEL to an existing GGUF file");
if (process.env.VANTA_RUNTIME_APPROVE !== "1") throw new Error("set VANTA_RUNTIME_APPROVE=1 to approve the bounded local launch proof");

const repoRoot = resolve(process.cwd(), "..");
const port = Number(process.env.VANTA_RUNTIME_PORT ?? 8899);
const kernelUrl = await ensureKernel({ baseUrl: process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788", kernelBin: kernelBinaryPath(repoRoot), root: repoRoot });
const kernel = createKernelClient(kernelUrl, repoRoot);
const lifecycle = createRuntimeLifecycleManager({
  root: repoRoot,
  assess: (action) => kernel.assess(action),
  requestApproval: async () => true,
  healthAttempts: 120,
  healthIntervalMs: 500,
});
const runtimeId = `live-llama-${Date.now()}`;

try {
  const result = await lifecycle.launch({
    id: runtimeId,
    backend: "llama_cpp",
    model,
    host: "127.0.0.1",
    port,
    contextTokens: 2048,
    modelBytes: (await stat(model)).size,
    availableMemoryBytes: totalmem(),
    retainOnFailure: false,
  });
  const receipts = (await readRuntimeLifecycleReceipts(repoRoot)).filter((receipt) => receipt.runtimeId === runtimeId);
  console.log(JSON.stringify({ ok: true, runtimeId, backend: result.state.backend, status: result.state.status, benchmark: result.benchmark, providerText: result.providerText, receiptTransitions: receipts.map((receipt) => receipt.transition) }, null, 2));
} finally {
  await lifecycle.stop(runtimeId).catch(() => undefined);
}
