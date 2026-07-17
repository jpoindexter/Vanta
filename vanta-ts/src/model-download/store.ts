import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ModelDownloadJobSchema,
  ModelDownloadReceiptSchema,
  type ModelDownloadJob,
  type ModelDownloadReceipt,
} from "./types.js";

const DIR = ".vanta/model-downloads";
const QUEUE = "queue.json";
const RECEIPTS = "receipts.jsonl";

export const modelDownloadDir = (root: string): string => join(root, DIR);
export const modelDownloadQueuePath = (root: string): string => join(modelDownloadDir(root), QUEUE);
export const modelDownloadReceiptPath = (root: string): string => join(modelDownloadDir(root), RECEIPTS);

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function readModelDownloadQueue(root: string): Promise<ModelDownloadJob[]> {
  try {
    const value = JSON.parse(await readFile(modelDownloadQueuePath(root), "utf8"));
    return ModelDownloadJobSchema.array().parse(value);
  } catch { return []; }
}

export async function writeModelDownloadQueue(root: string, jobs: ModelDownloadJob[]): Promise<void> {
  await atomicJson(modelDownloadQueuePath(root), ModelDownloadJobSchema.array().parse(jobs));
}

export async function saveModelDownloadJob(root: string, job: ModelDownloadJob): Promise<ModelDownloadJob> {
  const jobs = await readModelDownloadQueue(root);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index < 0) jobs.push(ModelDownloadJobSchema.parse(job));
  else jobs[index] = ModelDownloadJobSchema.parse(job);
  await writeModelDownloadQueue(root, jobs);
  return job;
}

export async function readModelDownloadJob(root: string, id: string): Promise<ModelDownloadJob> {
  const job = (await readModelDownloadQueue(root)).find((item) => item.id === id);
  if (!job) throw new Error(`model download not found: ${id}`);
  return job;
}

export async function appendModelDownloadReceipt(root: string, input: ModelDownloadReceipt): Promise<void> {
  const receipt = ModelDownloadReceiptSchema.parse(input);
  await mkdir(modelDownloadDir(root), { recursive: true });
  await appendFile(modelDownloadReceiptPath(root), `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function readModelDownloadReceipts(root: string): Promise<ModelDownloadReceipt[]> {
  try {
    return (await readFile(modelDownloadReceiptPath(root), "utf8")).split("\n").filter(Boolean)
      .map((line) => ModelDownloadReceiptSchema.parse(JSON.parse(line)));
  } catch { return []; }
}

export async function fileBytes(path: string): Promise<number> {
  try { return (await stat(path)).size; } catch { return 0; }
}
