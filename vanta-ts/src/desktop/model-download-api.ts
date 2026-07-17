import type http from "node:http";
import { createModelDownloadQueue, readModelDownloadReceipts, type ModelDownloadQueue } from "../model-download/index.js";
import { defaultExec } from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

const queues = new Map<string, ModelDownloadQueue>();

function queueFor(root: string): ModelDownloadQueue {
  const existing = queues.get(root);
  if (existing) return existing;
  const queue = createModelDownloadQueue({
    root,
    resolveSecret: async (reference, job) => resolveVaultSecretValue(
      reference.slice("secret://".length),
      `model-download:${job.id}`,
      process.env,
      defaultExec,
    ),
  });
  queues.set(root, queue);
  return queue;
}

export async function modelDownloadPayload(root: string, queue = queueFor(root)) {
  const [jobs, receipts] = await Promise.all([queue.list(), readModelDownloadReceipts(root)]);
  return { jobs, receipts: receipts.slice(-50) };
}

type DownloadAction =
  | { action: "enqueue"; input: unknown; start?: boolean }
  | { action: "run" | "pause" | "resume" | "retry"; id: string; background?: boolean }
  | { action: "cleanup"; id: string; confirmed: boolean };

async function applyAction(root: string, queue: ModelDownloadQueue, body: DownloadAction): Promise<void> {
  if (body.action === "enqueue") {
    const result = await queue.enqueue(body.input as never);
    if (body.start) void queue.run(result.job.id).catch(() => undefined);
    return;
  }
  if (body.action === "cleanup") { await queue.cleanup(body.id, body.confirmed); return; }
  if (body.action === "pause") { await queue.pause(body.id); return; }
  const operation = body.action === "retry" ? queue.retry(body.id) : body.action === "resume" ? queue.resume(body.id) : queue.run(body.id);
  if (body.background === false) await operation;
  else void operation.catch(() => undefined);
}

export async function handleModelDownloads(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  queue = queueFor(state.root),
): Promise<void> {
  if (req.method === "GET") return sendJson(res, 200, await modelDownloadPayload(state.root, queue));
  try {
    const body = await readJson(req) as DownloadAction;
    if (!body || typeof body.action !== "string") return sendJson(res, 400, { error: "model download action is required" });
    await applyAction(state.root, queue, body);
    sendJson(res, 200, await modelDownloadPayload(state.root, queue));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}
