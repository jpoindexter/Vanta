import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir, totalmem } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { detectFirstInferenceHardware } from "../src/first-inference/hardware.js";
import { sha256File } from "../src/first-inference/download.js";
import { createKernelClient } from "../src/kernel/client.js";
import { ensureKernel } from "../src/kernel-launcher.js";
import { createModelDownloadQueue } from "../src/model-download/queue.js";
import { readModelDownloadReceipts } from "../src/model-download/store.js";
import { createRuntimeLifecycleManager, readRuntimeLifecycleReceipts } from "../src/runtime-engine/manager.js";
import { createStoredRuntimeProfile, readSelectedRuntimeProfile, selectRuntimeProfile } from "../src/runtime-engine/profile-store.js";
import { runtimeProfileLaunchContract } from "../src/runtime-engine/profile-contract.js";
import type { RuntimeProcessPort } from "../src/runtime-engine/types.js";

const run = promisify(execFile);
const sourceModel = process.env.VANTA_LOCAL_RUNTIME_MODEL_SOURCE;
const expectedSha256 = process.env.VANTA_LOCAL_RUNTIME_MODEL_SHA256;
if (!sourceModel) throw new Error("set VANTA_LOCAL_RUNTIME_MODEL_SOURCE to a real GGUF model");
if (!expectedSha256) throw new Error("set VANTA_LOCAL_RUNTIME_MODEL_SHA256 to its trusted SHA-256");
if (process.env.VANTA_LOCAL_RUNTIME_APPROVE !== "1") throw new Error("set VANTA_LOCAL_RUNTIME_APPROVE=1 to approve the bounded local proof");

const packageRoot = process.cwd();
const repoRoot = resolve(packageRoot, "..");
const proofRoot = await mkdtemp(join(tmpdir(), "vanta-local-runtime-v1-"));
const runtimePort = await freePort();
const kernelPort = await freePort();
const runtimeId = "local-runtime-v1";
let sourceServer: Server | undefined;
let lifecycle: ReturnType<typeof createRuntimeLifecycleManager> | undefined;

try {
  await access(sourceModel);
  const source = await stat(sourceModel);
  const actualSha256 = await sha256File(sourceModel);
  if (actualSha256 !== expectedSha256) throw new Error(`source checksum mismatch: ${actualSha256}`);
  const hardware = await detectFirstInferenceHardware(proofRoot);
  if (!hardware.supported) throw new Error(`unsupported proof host: ${hardware.reason}`);

  await writeFixture(proofRoot);
  const served = await serveFile(sourceModel, source.size);
  sourceServer = served.server;
  const placeholder = join(proofRoot, ".vanta", "models", basename(sourceModel));
  await createStoredRuntimeProfile(proofRoot, {
    id: runtimeId,
    name: "Local Runtime v1 proof",
    backend: "llama_cpp",
    modelPath: placeholder,
    modelBytes: source.size,
    availableMemoryBytes: Math.floor(totalmem() * 0.8),
    port: runtimePort,
    contextTokens: 32_768,
    performance: { parallel: 1, gpuLayers: 99 },
    policyScope: "full",
  });
  await selectRuntimeProfile(proofRoot, runtimeId);

  const queue = createModelDownloadQueue({ root: proofRoot });
  await queue.enqueue({
    id: "qwen-coding-proof",
    label: "Qwen coding proof",
    source: {
      kind: "hugging_face",
      url: served.url,
      sha256: expectedSha256,
      bytes: source.size,
      filename: basename(sourceModel),
    },
    profileId: runtimeId,
  });
  const downloaded = await queue.run("qwen-coding-proof");
  if (downloaded.status !== "completed") throw new Error(`download failed: ${downloaded.failureCode ?? downloaded.status}`);
  if (await sha256File(downloaded.destination) !== expectedSha256) throw new Error("managed artifact checksum mismatch");

  const profile = await readSelectedRuntimeProfile(proofRoot);
  if (!profile) throw new Error("selected runtime profile missing");
  const contract = runtimeProfileLaunchContract(profile, hardware);
  if (!contract.validation.valid || !contract.roundTrip) throw new Error(`runtime profile invalid: ${JSON.stringify(contract.validation.issues)}`);

  const kernelUrl = await ensureKernel({
    baseUrl: `http://127.0.0.1:${kernelPort}`,
    kernelBin: resolve(repoRoot, "target/release/vanta-kernel"),
    root: proofRoot,
    ephemeral: true,
  });
  const kernel = createKernelClient(kernelUrl, proofRoot);
  lifecycle = createRuntimeLifecycleManager({
    root: proofRoot,
    assess: (action) => kernel.assess(action),
    requestApproval: async () => true,
    healthAttempts: 120,
    healthIntervalMs: 500,
  });
  const launched = await lifecycle.launch(contract.spec);

  const task = await run(process.execPath, ["--import", "tsx", "src/cli.ts", "run",
    "Read AGENTS.md, title.js, and title.test.js. Implement normalizeTitle so the test passes, then run node title.test.js. Do not change the test."], {
    cwd: packageRoot,
    timeout: 10 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      VANTA_PROJECT_ROOT: proofRoot,
      VANTA_KERNEL_URL: kernelUrl,
      VANTA_KERNEL_BIN: resolve(repoRoot, "target/release/vanta-kernel"),
      VANTA_PROVIDER: "custom",
      VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${runtimePort}/v1`,
      VANTA_OPENAI_API_KEY: "local-runtime-proof",
      VANTA_MODEL: "qwen2.5-14b-local",
      VANTA_PERMISSION_MODE: "fullAccess",
      VANTA_LOCAL_MAX_TOKENS: "256",
    },
  });
  const test = await run(process.execPath, ["title.test.js"], { cwd: proofRoot, timeout: 30_000 });
  if (!test.stdout.includes("local-runtime-coding-proof: passed")) throw new Error("coding task did not pass its real test");
  if (!task.stdout.includes("edit_file") || !task.stdout.includes("local-runtime-coding-proof: passed")) throw new Error("Vanta task lacked edit/test evidence");

  const routeRows = await jsonl(join(proofRoot, ".vanta", "route-usage-ledger.jsonl"));
  const resourceRows = await jsonl(join(proofRoot, ".vanta", "runtime-resource-ledger.jsonl"));
  const joined = routeRows.some((route) => resourceRows.some((resource) => resource.callId === route.callId));
  if (!joined) throw new Error("runtime telemetry did not join the route usage receipt");

  const recovery = await proveRecoveryPolicies(proofRoot);
  const downloadReceipts = await readModelDownloadReceipts(proofRoot);
  const runtimeReceipts = (await readRuntimeLifecycleReceipts(proofRoot)).filter((row) => row.runtimeId === runtimeId);
  console.log(JSON.stringify({
    ok: true,
    hardware: { platform: hardware.platform, architecture: hardware.architecture, memoryBytes: hardware.memoryBytes, freeDiskBytes: hardware.freeDiskBytes },
    artifact: { bytes: source.size, sha256: actualSha256, transitions: downloadReceipts.map((row) => row.transition) },
    profile: { id: profile.id, commandHash: contract.preview.commandHash, contextTokens: profile.resources.contextTokens, roundTrip: contract.roundTrip },
    runtime: { status: launched.state.status, benchmark: launched.benchmark, transitions: runtimeReceipts.map((row) => row.transition) },
    task: { edited: true, test: test.stdout.trim() },
    usage: { routeCalls: routeRows.length, resourceCalls: resourceRows.length, joined },
    recovery,
  }));
} finally {
  if (lifecycle) await lifecycle.stop(runtimeId).catch(() => undefined);
  await new Promise<void>((resolveClose) => sourceServer?.close(() => resolveClose()) ?? resolveClose());
  if (process.env.VANTA_LOCAL_RUNTIME_KEEP_PROOF !== "1") await rm(proofRoot, { recursive: true, force: true });
}

async function writeFixture(root: string): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(join(root, "AGENTS.md"), "# Local Runtime Proof\n\n- Work only in this fixture.\n- Read before editing.\n- Run the provided Node test.\n"),
    writeFile(join(root, "title.js"), "export function normalizeTitle(value) {\n  return String(value).trim();\n}\n"),
    writeFile(join(root, "title.test.js"), "import assert from \"node:assert/strict\";\nimport { normalizeTitle } from \"./title.js\";\nassert.equal(normalizeTitle(\"  LOCAL   runtime  \"), \"local-runtime\");\nconsole.log(\"local-runtime-coding-proof: passed\");\n"),
    writeFile(join(root, "package.json"), "{\"type\":\"module\"}\n"),
  ]);
}

async function serveFile(path: string, bytes: number): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const start = Number(req.headers.range?.match(/^bytes=(\d+)-/)?.[1] ?? 0);
    res.writeHead(start > 0 ? 206 : 200, {
      "content-type": "application/octet-stream",
      "content-length": String(bytes - start),
      ...(start > 0 ? { "content-range": `bytes ${start}-${bytes - 1}/${bytes}` } : {}),
    });
    createReadStream(path, { start }).pipe(res);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("model source server failed to bind");
  return { server, url: `http://127.0.0.1:${address.port}/model.gguf` };
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to allocate port");
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  return address.port;
}

async function jsonl(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(path, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function proveRecoveryPolicies(root: string): Promise<{ retained: boolean; stopped: boolean; retried: boolean }> {
  let pid = 30_000;
  const alive = new Set<number>();
  const processPort: RuntimeProcessPort = {
    start: async () => { const next = pid++; alive.add(next); return { pid: next }; },
    alive: async (value) => alive.has(value),
    stop: async (value) => { alive.delete(value); },
  };
  const failedFetch = async (url: string | URL | Request) => String(url).endsWith("/health")
    ? new Response("ok", { status: 200 })
    : Response.json({ choices: [{ message: { content: "WRONG" } }], usage: { completion_tokens: 1 } });
  const successfulFetch = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/health")) return new Response("ok", { status: 200 });
    const prompt = JSON.parse(String(init?.body)).messages[0].content;
    return Response.json({ choices: [{ message: { content: prompt.includes("RUNTIME") ? "VANTA_RUNTIME_OK" : "VANTA_PROVIDER_OK" } }], usage: { completion_tokens: 1 } });
  };
  const spec = (id: string, retainOnFailure: boolean) => ({ id, backend: "llama_cpp" as const, model: "/models/proof.gguf", host: "127.0.0.1", port: 19_000 + pid, contextTokens: 512, modelBytes: 1, availableMemoryBytes: 1024 ** 3, retainOnFailure });
  const manager = (fetcher: typeof globalThis.fetch) => createRuntimeLifecycleManager({ root, process: processPort, fetch: fetcher, assess: async () => ({ risk: "allow" }), requestApproval: async () => true, healthAttempts: 1 });
  await manager(failedFetch as typeof globalThis.fetch).launch(spec("recovery-retain", true)).catch(() => undefined);
  await manager(failedFetch as typeof globalThis.fetch).launch(spec("recovery-stop", false)).catch(() => undefined);
  await manager(successfulFetch as typeof globalThis.fetch).launch(spec("recovery-retry", false));
  const rows = await readRuntimeLifecycleReceipts(root);
  return {
    retained: rows.some((row) => row.runtimeId === "recovery-retain" && row.transition === "retained_after_failure"),
    stopped: rows.some((row) => row.runtimeId === "recovery-stop" && row.transition === "stopped_after_failure"),
    retried: rows.some((row) => row.runtimeId === "recovery-retry" && row.transition === "running"),
  };
}
