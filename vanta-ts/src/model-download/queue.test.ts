import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStoredRuntimeProfile, readRuntimeProfile, selectRuntimeProfile } from "../runtime-engine/profile-store.js";
import { createModelDownloadQueue } from "./queue.js";
import { readModelDownloadReceipts, saveModelDownloadJob } from "./store.js";
import type { CreateModelDownload } from "./types.js";

let root: string;
const servers: Server[] = [];
const gib = 1024 ** 3;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-model-download-")); });
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await rm(root, { recursive: true, force: true });
});

function input(url: string, bytes: Buffer, patch: Partial<CreateModelDownload> = {}): CreateModelDownload {
  return {
    id: "fixture", label: "Fixture model",
    source: {
      kind: "hugging_face", url, bytes: bytes.length, filename: "fixture.gguf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    ...patch,
  };
}

async function fixture(bytes: Buffer, token?: string): Promise<{ url: string; ranges: string[]; auth: string[] }> {
  const ranges: string[] = []; const auth: string[] = [];
  const server = createServer((req, res) => {
    auth.push(req.headers.authorization ?? "");
    if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    const range = req.headers.range;
    if (range) ranges.push(range);
    const start = range ? Number(range.match(/bytes=(\d+)-/)?.[1] ?? 0) : 0;
    res.writeHead(range ? 206 : 200, { "content-length": bytes.length - start, "accept-ranges": "bytes" });
    res.end(bytes.subarray(start));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture unavailable");
  return { url: `http://127.0.0.1:${address.port}/model.gguf`, ranges, auth };
}

describe("durable model download queue", () => {
  it("resumes authenticated bytes, verifies them, and links the selected profile", async () => {
    const bytes = Buffer.from("verified durable model bytes");
    const server = await fixture(bytes, "hf-fixture-token");
    await createStoredRuntimeProfile(root, { id: "daily", name: "Daily", backend: "llama_cpp", modelPath: "/old.gguf", modelBytes: 1, availableMemoryBytes: gib });
    await selectRuntimeProfile(root, "daily");
    const target = join(root, ".vanta", "models", "fixture.gguf");
    await mkdir(join(root, ".vanta", "models"), { recursive: true });
    await writeFile(`${target}.part`, bytes.subarray(0, 9));
    const queue = createModelDownloadQueue({ root, resolveSecret: async () => "hf-fixture-token", freeDiskBytes: async () => gib });
    const source = { ...input(server.url, bytes).source, authSecretRef: "secret://huggingface/token" };
    await queue.enqueue(input(server.url, bytes, { source }));

    const completed = await queue.run("fixture");

    expect(completed).toMatchObject({ status: "completed", downloadedBytes: bytes.length, resumedAt: 9, profileId: "daily", recovery: undefined });
    expect(server.ranges).toEqual(["bytes=9-"]);
    expect(server.auth).toEqual(["Bearer hf-fixture-token"]);
    expect(await readFile(target)).toEqual(bytes);
    expect((await readRuntimeProfile(root, "daily")).model).toEqual({ path: target, bytes: bytes.length });
    expect((await readModelDownloadReceipts(root)).map((receipt) => receipt.transition)).toEqual(expect.arrayContaining(["enqueued", "downloading", "verifying", "completed", "profile_linked"]));
  });

  it("deduplicates requests and recovers interrupted and moved-storage records", async () => {
    const bytes = Buffer.from("queue recovery bytes");
    const server = await fixture(bytes);
    const queue = createModelDownloadQueue({ root, freeDiskBytes: async () => gib });
    const first = await queue.enqueue(input(server.url, bytes));
    const duplicate = await queue.enqueue({ ...input(server.url, bytes), id: "duplicate" });
    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ duplicate: true, job: { id: "fixture" } });

    const stamp = new Date().toISOString();
    await saveModelDownloadJob(root, { ...first.job, status: "downloading", downloadedBytes: 4, updatedAt: stamp });
    expect(await queue.list()).toEqual([expect.objectContaining({ status: "paused", failureCode: "interrupted_restart" })]);
    await mkdir(first.job.storageRoot, { recursive: true });
    await writeFile(first.job.destination, bytes);
    await saveModelDownloadJob(root, { ...first.job, status: "completed", downloadedBytes: bytes.length, completedAt: stamp, updatedAt: stamp });
    await rm(first.job.destination);
    expect(await queue.list()).toEqual([expect.objectContaining({ status: "failed", failureCode: "storage_moved" })]);
  });

  it("fails safely for low disk and unresolved auth, and confirms partial cleanup", async () => {
    const bytes = Buffer.from("resource failure bytes");
    const server = await fixture(bytes);
    const lowDisk = createModelDownloadQueue({ root, freeDiskBytes: async () => 0 });
    await lowDisk.enqueue(input(server.url, bytes));
    expect(await lowDisk.run("fixture")).toMatchObject({ status: "failed", failureCode: "low_disk" });

    const partial = join(root, ".vanta", "models", "fixture.gguf.part");
    await mkdir(join(root, ".vanta", "models"), { recursive: true });
    await writeFile(partial, "partial");
    await expect(lowDisk.cleanup("fixture", false)).rejects.toThrow("requires confirmation");
    expect(await lowDisk.cleanup("fixture", true)).toMatchObject({ status: "queued", downloadedBytes: 0 });
    await expect(readFile(partial)).rejects.toThrow();

    const authRoot = await mkdtemp(join(tmpdir(), "vanta-model-auth-"));
    try {
      const authQueue = createModelDownloadQueue({ root: authRoot, freeDiskBytes: async () => gib });
      const source = { ...input(server.url, bytes).source, authSecretRef: "secret://huggingface/token" };
      await authQueue.enqueue(input(server.url, bytes, { source }));
      expect(await authQueue.run("fixture")).toMatchObject({ status: "failed", failureCode: "auth_unavailable" });
    } finally { await rm(authRoot, { recursive: true, force: true }); }
  });

  it("persists a pause and resumes from the partial artifact", async () => {
    const bytes = Buffer.from("paused then resumed");
    const server = await fixture(bytes);
    let ready!: () => void;
    const abortReady = new Promise<void>((resolve) => { ready = resolve; });
    const queue = createModelDownloadQueue({
      root, freeDiskBytes: async () => gib,
      download: async (options) => {
        await mkdir(join(root, ".vanta", "models"), { recursive: true });
        await writeFile(`${options.destination}.part`, bytes.subarray(0, 6));
        await options.onProgress?.(6, 0);
        await new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
          ready();
        });
        return { path: options.destination, resumedAt: 6 };
      },
    });
    await queue.enqueue(input(server.url, bytes));
    const running = queue.run("fixture");
    await abortReady;
    await queue.pause("fixture");
    expect(await running).toMatchObject({ status: "paused", downloadedBytes: 6 });

    const resumedQueue = createModelDownloadQueue({ root, freeDiskBytes: async () => gib });
    expect(await resumedQueue.resume("fixture")).toMatchObject({ status: "completed", resumedAt: 6, recovery: undefined });
  });
});
