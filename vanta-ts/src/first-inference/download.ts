import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FirstInferenceModel } from "./types.js";

export class FirstInferenceFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

type DownloadOptions = {
  model: FirstInferenceModel;
  destination: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  onProgress?: (downloadedBytes: number, resumedAt: number) => Promise<void> | void;
  onVerifying?: () => Promise<void> | void;
};

async function fileSize(path: string): Promise<number> {
  try { return (await stat(path)).size; } catch { return 0; }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function downloadFirstInferenceModel(options: DownloadOptions): Promise<{ path: string; resumedAt: number }> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const partial = `${options.destination}.part`;
  await mkdir(dirname(options.destination), { recursive: true });
  let resumedAt = Math.min(await fileSize(partial), options.model.bytes);

  if (await fileSize(options.destination) === options.model.bytes) {
    if (await sha256File(options.destination) === options.model.sha256) return { path: options.destination, resumedAt: options.model.bytes };
    await rm(options.destination, { force: true });
  }

  let response: Response;
  try {
    response = await fetcher(options.model.url, {
      headers: { ...options.headers, ...(resumedAt > 0 ? { range: `bytes=${resumedAt}-` } : {}) },
      signal: options.signal,
      redirect: "follow",
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new FirstInferenceFailure("cancelled");
    throw new FirstInferenceFailure("offline_download");
  }
  if (!response.ok && response.status !== 206) throw new FirstInferenceFailure(`download_http_${response.status}`);
  if (!response.body) throw new FirstInferenceFailure("download_body_missing");
  if (resumedAt > 0 && response.status !== 206) {
    resumedAt = 0;
    await rm(partial, { force: true });
  }

  let downloaded = resumedAt;
  const progress = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      downloaded += chunk.byteLength;
      controller.enqueue(chunk);
      await options.onProgress?.(downloaded, resumedAt);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body.pipeThrough(progress) as never), createWriteStream(partial, { flags: resumedAt > 0 ? "a" : "w", mode: 0o600 }));
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new FirstInferenceFailure("cancelled");
    throw new FirstInferenceFailure("download_interrupted");
  }
  if (await fileSize(partial) !== options.model.bytes) throw new FirstInferenceFailure("download_size_mismatch");
  await options.onVerifying?.();
  if (await sha256File(partial) !== options.model.sha256) {
    await rm(partial, { force: true });
    throw new FirstInferenceFailure("checksum_mismatch");
  }
  await rename(partial, options.destination);
  return { path: options.destination, resumedAt };
}
