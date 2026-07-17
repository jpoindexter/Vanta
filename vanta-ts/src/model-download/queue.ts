import { mkdir, rm, statfs } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { downloadFirstInferenceModel, FirstInferenceFailure } from "../first-inference/download.js";
import { linkRuntimeProfileModel, readSelectedRuntimeProfile } from "../runtime-engine/profile-store.js";
import { appendModelDownloadReceipt, fileBytes, readModelDownloadJob, readModelDownloadQueue, saveModelDownloadJob, writeModelDownloadQueue } from "./store.js";
import { CreateModelDownloadSchema, ModelDownloadJobSchema, downloadRecovery, type CreateModelDownload, type ModelDownloadJob, type ModelDownloadReceipt, type ModelDownloadStatus } from "./types.js";

type Downloader = typeof downloadFirstInferenceModel;
type QueueOptions = {
  root: string; fetch?: typeof globalThis.fetch; now?: () => Date; download?: Downloader;
  freeDiskBytes?: (path: string) => Promise<number>;
  resolveSecret?: (reference: string, job: ModelDownloadJob) => Promise<string | null>;
};
type DownloadContext = { job: ModelDownloadJob; controller: AbortController; authorization?: string };

const active = new Set<ModelDownloadStatus>(["downloading", "verifying"]);
const SAFETY_BYTES = 64 * 1024 * 1024;
const diskFree = async (path: string): Promise<number> => { const info = await statfs(path); return Number(info.bavail) * Number(info.bsize); };

function targetFor(root: string, input: CreateModelDownload) {
  const storageRoot = input.storageRoot ? (isAbsolute(input.storageRoot) ? input.storageRoot : resolve(root, input.storageRoot)) : join(root, ".vanta", "models");
  return { storageRoot, destination: join(storageRoot, input.source.filename) };
}

class ModelDownloadQueueController {
  private readonly now: () => Date;
  private readonly downloader: Downloader;
  private readonly freeDisk: (path: string) => Promise<number>;
  private readonly controllers = new Map<string, AbortController>();
  private readonly pausing = new Set<string>();

  constructor(private readonly options: QueueOptions) {
    this.now = options.now ?? (() => new Date());
    this.downloader = options.download ?? downloadFirstInferenceModel;
    this.freeDisk = options.freeDiskBytes ?? diskFree;
  }

  private async receipt(job: ModelDownloadJob, transition: ModelDownloadReceipt["transition"], code?: string): Promise<void> {
    await appendModelDownloadReceipt(this.options.root, {
      version: 1, jobId: job.id, at: this.now().toISOString(), transition,
      downloadedBytes: job.downloadedBytes, destination: job.destination, code,
      ...(job.profileId ? { profileId: job.profileId } : {}),
    });
  }

  private async transition(job: ModelDownloadJob, status: ModelDownloadStatus, patch: Partial<ModelDownloadJob> = {}): Promise<ModelDownloadJob> {
    const next = ModelDownloadJobSchema.parse({ ...job, ...patch, status, updatedAt: this.now().toISOString() });
    await saveModelDownloadJob(this.options.root, next);
    await this.receipt(next, status, next.failureCode);
    return next;
  }

  async list(): Promise<ModelDownloadJob[]> {
    const jobs = await readModelDownloadQueue(this.options.root);
    const next = await Promise.all(jobs.map((job) => this.reconcileJob(job)));
    if (next.some((job, index) => job !== jobs[index])) await writeModelDownloadQueue(this.options.root, next);
    return next;
  }

  private async reconcileJob(job: ModelDownloadJob): Promise<ModelDownloadJob> {
    const stamp = this.now().toISOString();
    if (active.has(job.status) && !this.controllers.has(job.id)) return ModelDownloadJobSchema.parse({ ...job, status: "paused", failureCode: "interrupted_restart", recovery: downloadRecovery("interrupted_restart"), updatedAt: stamp });
    if (job.status === "completed" && await fileBytes(job.destination) !== job.source.bytes) return ModelDownloadJobSchema.parse({ ...job, status: "failed", failureCode: "storage_moved", recovery: downloadRecovery("storage_moved"), updatedAt: stamp, completedAt: undefined });
    const storageMissing = job.downloadedBytes > 0 && job.status !== "completed" && await fileBytes(job.storageRoot) === 0 && await fileBytes(`${job.destination}.part`) === 0;
    return storageMissing ? ModelDownloadJobSchema.parse({ ...job, status: "failed", failureCode: "storage_unavailable", recovery: downloadRecovery("storage_unavailable"), updatedAt: stamp }) : job;
  }

  async enqueue(raw: CreateModelDownload): Promise<{ job: ModelDownloadJob; duplicate: boolean }> {
    const input = CreateModelDownloadSchema.parse(raw); const target = targetFor(this.options.root, input); const jobs = await this.list();
    const duplicate = jobs.find((job) => job.source.url === input.source.url && job.source.sha256 === input.source.sha256 && job.destination === target.destination);
    if (duplicate) { await this.receipt(duplicate, "duplicate"); return { job: duplicate, duplicate: true }; }
    if (jobs.some((job) => job.id === input.id)) throw new Error(`model download already exists: ${input.id}`);
    const stamp = this.now().toISOString();
    const job = ModelDownloadJobSchema.parse({ version: 1, ...input, ...target, status: "queued", downloadedBytes: 0, createdAt: stamp, updatedAt: stamp });
    await saveModelDownloadJob(this.options.root, job); await this.receipt(job, "enqueued");
    return { job, duplicate: false };
  }

  read(id: string): Promise<ModelDownloadJob> { return readModelDownloadJob(this.options.root, id); }

  private async prepare(id: string): Promise<ModelDownloadJob | DownloadContext> {
    const job = await this.read(id);
    if (job.status === "completed" || this.controllers.has(id)) return job;
    await mkdir(job.storageRoot, { recursive: true });
    const partialBytes = await fileBytes(`${job.destination}.part`);
    const required = Math.max(0, job.source.bytes - partialBytes) + Math.min(SAFETY_BYTES, job.source.bytes);
    if (await this.freeDisk(job.storageRoot) < required) return this.transition(job, "failed", { failureCode: "low_disk", recovery: downloadRecovery("low_disk") });
    const authorization = await this.authorization(job);
    if (job.source.authSecretRef && !authorization) return this.transition(job, "failed", { failureCode: "auth_unavailable", recovery: downloadRecovery("auth_unavailable") });
    const controller = new AbortController(); this.controllers.set(id, controller);
    return { job: await this.transition(job, "downloading", { downloadedBytes: partialBytes, resumedAt: partialBytes, failureCode: undefined, recovery: undefined }), controller, authorization };
  }

  private async authorization(job: ModelDownloadJob): Promise<string | undefined> {
    if (!job.source.authSecretRef) return undefined;
    try { return await this.options.resolveSecret?.(job.source.authSecretRef, job) ?? undefined; }
    catch { return undefined; }
  }

  async run(id: string): Promise<ModelDownloadJob> {
    const prepared = await this.prepare(id);
    if (!("controller" in prepared)) return prepared;
    let { job } = prepared; let persisted = job.downloadedBytes;
    try {
      const result = await this.downloader({
        model: { id: job.id, label: job.label, url: job.source.url, sha256: job.source.sha256, bytes: job.source.bytes, filename: job.source.filename, contextTokens: 512 },
        destination: job.destination, fetch: this.options.fetch, signal: prepared.controller.signal,
        ...(prepared.authorization ? { headers: { authorization: `Bearer ${prepared.authorization}` } } : {}),
        onProgress: async (downloadedBytes, resumedAt) => { if (downloadedBytes - persisted < 8 * 1024 * 1024 && downloadedBytes !== job.source.bytes) return; persisted = downloadedBytes; job = await this.transition(job, "downloading", { downloadedBytes, resumedAt }); },
        onVerifying: async () => { job = await this.transition(job, "verifying", { downloadedBytes: job.source.bytes }); },
      });
      job = await this.transition(job, "completed", { downloadedBytes: job.source.bytes, resumedAt: result.resumedAt, completedAt: this.now().toISOString(), failureCode: undefined, recovery: undefined });
      return this.linkProfile(job);
    } catch (error) { return await this.fail(job, error); }
    finally { this.controllers.delete(id); this.pausing.delete(id); }
  }

  private async fail(job: ModelDownloadJob, error: unknown): Promise<ModelDownloadJob> {
    const partial = await fileBytes(`${job.destination}.part`);
    if (this.pausing.has(job.id)) return this.transition(job, "paused", { downloadedBytes: partial, failureCode: undefined, recovery: "Resume to continue from the persisted partial artifact." });
    const code = error instanceof FirstInferenceFailure ? error.code : "download_failed";
    const detail = error instanceof Error && !(error instanceof FirstInferenceFailure) ? ` ${error.message.slice(0, 240)}` : "";
    return this.transition(job, "failed", { downloadedBytes: partial, failureCode: code, recovery: `${downloadRecovery(code)}${detail}`.slice(0, 500) });
  }

  private async linkProfile(job: ModelDownloadJob): Promise<ModelDownloadJob> {
    const profileId = job.profileId ?? (await readSelectedRuntimeProfile(this.options.root))?.id;
    if (!profileId) return job;
    await linkRuntimeProfileModel(this.options.root, profileId, job.destination, job.source.bytes, this.now);
    const linked = await saveModelDownloadJob(this.options.root, { ...job, profileId }); await this.receipt(linked, "profile_linked");
    return linked;
  }

  async pause(id: string): Promise<ModelDownloadJob> {
    const job = await this.read(id); const controller = this.controllers.get(id);
    if (controller) { this.pausing.add(id); controller.abort(); return job; }
    return job.status === "queued" || active.has(job.status) ? this.transition(job, "paused", { recovery: "Resume to continue from the persisted partial artifact." }) : job;
  }

  async resume(id: string): Promise<ModelDownloadJob> { return this.run(id); }
  async retry(id: string): Promise<ModelDownloadJob> { const job = await this.read(id); await this.transition(job, "queued", { failureCode: undefined, recovery: undefined }); return this.run(id); }

  async cleanup(id: string, confirmed: boolean): Promise<ModelDownloadJob> {
    if (!confirmed) throw new Error("partial artifact cleanup requires confirmation");
    if (this.controllers.has(id)) throw new Error("pause the download before removing its partial artifact");
    const job = await this.read(id); await rm(`${job.destination}.part`, { force: true });
    const next = await this.transition(job, "queued", { downloadedBytes: 0, resumedAt: 0, failureCode: undefined, recovery: undefined });
    await this.receipt(next, "cleaned"); return next;
  }
}

export function createModelDownloadQueue(options: QueueOptions) { return new ModelDownloadQueueController(options); }
export type ModelDownloadQueue = ReturnType<typeof createModelDownloadQueue>;
