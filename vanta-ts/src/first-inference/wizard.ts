import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeLifecycleManager, RuntimeLaunchSpec, RuntimeProcessState } from "../runtime-engine/types.js";
import { downloadFirstInferenceModel, FirstInferenceFailure } from "./download.js";
import { detectFirstInferenceHardware, modelFitsHardware, modelStorageRequirement } from "./hardware.js";
import {
  FirstInferenceCheckpointSchema,
  FirstInferenceReceiptSchema,
  QWEN_05B_Q4_K_M,
  type FirstInferenceCheckpoint,
  type FirstInferenceHardware,
  type FirstInferenceModel,
  type FirstInferenceReceipt,
  type FirstInferenceStatus,
} from "./types.js";

type WizardOptions = {
  root: string;
  lifecycle: RuntimeLifecycleManager;
  wizardId?: string;
  model?: FirstInferenceModel;
  port?: number;
  fetch?: typeof globalThis.fetch;
  detectHardware?: (root: string) => Promise<FirstInferenceHardware>;
  download?: typeof downloadFirstInferenceModel;
  now?: () => Date;
};

export type FirstInferenceResult = {
  checkpoint: FirstInferenceCheckpoint;
  hardware: FirstInferenceHardware;
  model: FirstInferenceModel;
  modelPath: string;
  runtime: RuntimeProcessState;
  response: string;
};

const stateDir = (root: string): string => join(root, ".vanta", "first-inference");
const statePath = (root: string, id: string): string => join(stateDir(root), `${id}.json`);
const receiptsPath = (root: string): string => join(stateDir(root), "receipts.jsonl");
const modelPath = (root: string, model: FirstInferenceModel): string => join(root, ".vanta", "models", model.filename);

async function atomicCheckpoint(root: string, checkpoint: FirstInferenceCheckpoint): Promise<void> {
  await mkdir(stateDir(root), { recursive: true });
  const path = statePath(root, checkpoint.wizardId);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(FirstInferenceCheckpointSchema.parse(checkpoint), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function readFirstInferenceCheckpoint(root: string, wizardId = "local-model-first"): Promise<FirstInferenceCheckpoint | null> {
  try { return FirstInferenceCheckpointSchema.parse(JSON.parse(await readFile(statePath(root, wizardId), "utf8"))); }
  catch { return null; }
}

export async function readFirstInferenceReceipts(root: string): Promise<FirstInferenceReceipt[]> {
  try {
    return (await readFile(receiptsPath(root), "utf8")).split("\n").filter(Boolean)
      .map((line) => FirstInferenceReceiptSchema.parse(JSON.parse(line)));
  } catch { return []; }
}

export function createFirstInferenceWizard(options: WizardOptions) {
  const wizardId = options.wizardId ?? "local-model-first";
  const model = options.model ?? QWEN_05B_Q4_K_M;
  const runtimeId = `${wizardId}-runtime`;
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetch ?? globalThis.fetch;
  const detector = options.detectHardware ?? detectFirstInferenceHardware;
  const downloader = options.download ?? downloadFirstInferenceModel;
  const destination = modelPath(options.root, model);

  async function record(transition: FirstInferenceStatus, code?: string, metrics?: FirstInferenceReceipt["metrics"], responseSha256?: string): Promise<void> {
    const receipt = FirstInferenceReceiptSchema.parse({ version: 1, wizardId, modelId: model.id, at: now().toISOString(), transition, code, metrics, responseSha256 });
    await mkdir(stateDir(options.root), { recursive: true });
    await appendFile(receiptsPath(options.root), `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async function transition(status: FirstInferenceStatus, patch: Partial<FirstInferenceCheckpoint> = {}, metrics?: FirstInferenceReceipt["metrics"]): Promise<FirstInferenceCheckpoint> {
    const prior = await readFirstInferenceCheckpoint(options.root, wizardId);
    const checkpoint = FirstInferenceCheckpointSchema.parse({
      version: 1, wizardId, modelId: model.id, downloadedBytes: prior?.downloadedBytes ?? 0,
      ...prior, ...patch, status, updatedAt: now().toISOString(),
    });
    await atomicCheckpoint(options.root, checkpoint);
    await record(status, checkpoint.failureCode, metrics ?? { downloadedBytes: checkpoint.downloadedBytes });
    return checkpoint;
  }

  async function prepare(): Promise<{ hardware: FirstInferenceHardware; checkpoint: FirstInferenceCheckpoint; storageRequiredBytes: number }> {
    const hardware = await detector(options.root);
    if (!hardware.supported) throw new FirstInferenceFailure(hardware.reason);
    if (hardware.freeDiskBytes < modelStorageRequirement(model)) throw new FirstInferenceFailure("low_disk");
    if (!modelFitsHardware(hardware, model)) throw new FirstInferenceFailure("insufficient_memory");
    const checkpoint = await transition("ready");
    return { hardware, checkpoint, storageRequiredBytes: modelStorageRequirement(model) };
  }

  function launchSpec(hardware: FirstInferenceHardware): RuntimeLaunchSpec {
    return {
      id: runtimeId, backend: "llama_cpp", model: destination, host: "127.0.0.1",
      port: options.port ?? 8127, contextTokens: model.contextTokens, modelBytes: model.bytes,
      availableMemoryBytes: Math.max(1, Math.floor(hardware.memoryBytes * 0.8)), retainOnFailure: true,
    };
  }

  async function recoverRuntime(spec: RuntimeLaunchSpec): Promise<RuntimeProcessState | null> {
    const recovered = await options.lifecycle.recover();
    const runtime = recovered.find((state) => state.runtimeId === runtimeId && state.status === "running");
    return runtime ?? null;
  }

  async function preview() {
    const hardware = await detector(options.root);
    return {
      hardware,
      model,
      storageRequiredBytes: modelStorageRequirement(model),
      launch: options.lifecycle.preview(launchSpec(hardware)),
    };
  }

  async function usefulTask(endpoint: string, signal?: AbortSignal): Promise<{ text: string; latencyMs: number }> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetcher(`${endpoint}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" }, signal,
        body: JSON.stringify({ model: "vanta-local", temperature: 0, max_tokens: 80, messages: [{ role: "user", content: "Give one concrete next action for organizing three overdue project tasks. Answer in one sentence." }] }),
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new FirstInferenceFailure("cancelled");
      throw new FirstInferenceFailure("useful_task_transport_failed");
    }
    if (!response.ok) throw new FirstInferenceFailure(`useful_task_http_${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 8) throw new FirstInferenceFailure("useful_task_empty");
    return { text, latencyMs: Date.now() - started };
  }

  async function run(signal?: AbortSignal): Promise<FirstInferenceResult> {
    let hardware: FirstInferenceHardware;
    let checkpoint = await readFirstInferenceCheckpoint(options.root, wizardId);
    try {
      hardware = await detector(options.root);
      if (!hardware.supported) throw new FirstInferenceFailure(hardware.reason);
      if (hardware.freeDiskBytes < modelStorageRequirement(model) && (await stat(destination).catch(() => null))?.size !== model.bytes) throw new FirstInferenceFailure("low_disk");
      if (!modelFitsHardware({ ...hardware, freeDiskBytes: Math.max(hardware.freeDiskBytes, modelStorageRequirement(model)) }, model)) throw new FirstInferenceFailure("insufficient_memory");
      if (!checkpoint) checkpoint = await transition("ready");

      if (!["downloaded", "launching", "running", "task_verified", "done"].includes(checkpoint.status)) {
        checkpoint = await transition("downloading", { failureCode: undefined });
      }
      let persistedAt = checkpoint.downloadedBytes;
      const downloaded = await downloader({
        model, destination, fetch: fetcher, signal,
        onProgress: async (downloadedBytes, resumedAt) => {
          if (downloadedBytes - persistedAt < 8 * 1024 * 1024 && downloadedBytes !== model.bytes) return;
          persistedAt = downloadedBytes;
          checkpoint = await transition("downloading", { downloadedBytes, failureCode: undefined }, { downloadedBytes, downloadResumedAt: resumedAt });
        },
      });
      checkpoint = await transition("downloaded", { downloadedBytes: model.bytes, modelSha256: model.sha256, failureCode: undefined });

      const spec = launchSpec(hardware);
      let runtime = await recoverRuntime(spec);
      if (!runtime) {
        checkpoint = await transition("launching", { runtimeId, failureCode: undefined });
        runtime = (await options.lifecycle.launch(spec)).state;
      }
      checkpoint = await transition("running", { runtimeId, failureCode: undefined });
      const endpoint = options.lifecycle.preview(spec).endpoint;
      const task = await usefulTask(endpoint, signal);
      const responseSha256 = createHash("sha256").update(task.text).digest("hex");
      checkpoint = await transition("task_verified", { runtimeId, failureCode: undefined });
      await record("task_verified", undefined, { latencyMs: task.latencyMs, outputCharacters: task.text.length }, responseSha256);
      checkpoint = await transition("done", { runtimeId, failureCode: undefined });
      return { checkpoint, hardware, model, modelPath: downloaded.path, runtime, response: task.text };
    } catch (error) {
      const code = error instanceof FirstInferenceFailure ? error.code : error instanceof Error ? error.message : "first_inference_failed";
      const status = code === "cancelled" ? "cancelled" : "failed";
      await transition(status, { failureCode: code });
      throw new FirstInferenceFailure(code);
    }
  }

  return { prepare, preview, run, status: () => readFirstInferenceCheckpoint(options.root, wizardId), model, modelPath: destination };
}
