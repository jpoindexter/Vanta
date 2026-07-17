import { createInterface } from "node:readline/promises";
import { createFirstInferenceWizard, FirstInferenceModelSchema, QWEN_05B_Q4_K_M, readFirstInferenceCheckpoint, readFirstInferenceReceipts } from "../first-inference/index.js";
import { createKernelClient, type KernelClient } from "../kernel/client.js";
import { createRuntimeLifecycleManager } from "../runtime-engine/manager.js";
import type { FirstInferenceModel } from "../first-inference/types.js";
import { runRuntimeProfileCommand } from "./runtime-profile-cmd.js";
import { runModelDownloadCommand } from "./model-download-cmd.js";

type LocalModelDeps = {
  log?: (line: string) => void;
  kernel?: KernelClient;
  confirm?: (question: string) => Promise<boolean>;
  createWizard?: typeof createFirstInferenceWizard;
};

function flag(rest: string[], name: string): string | undefined {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
}

function numberFlag(rest: string[], name: string): number | undefined {
  const value = flag(rest, name);
  return value === undefined ? undefined : Number(value);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function selectedModel(rest: string[]) {
  const custom = flag(rest, "--model-url");
  if (!custom) return QWEN_05B_Q4_K_M;
  return FirstInferenceModelSchema.parse({
    id: flag(rest, "--model-id"), label: flag(rest, "--model-label") ?? flag(rest, "--model-id"),
    url: custom, sha256: flag(rest, "--sha256"), bytes: numberFlag(rest, "--bytes"),
    filename: flag(rest, "--filename"), contextTokens: numberFlag(rest, "--context") ?? 2_048,
  });
}

async function terminalConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(y|yes)$/i.test((await rl.question(question)).trim()); }
  finally { rl.close(); }
}

function usage(log: (line: string) => void): number {
  log("Usage: vanta local-model setup [--yes] [--json] [--port <n>]");
  log("       vanta local-model status [--json]");
  log("       vanta local-model profiles list|show|create|clone|validate|select|export|import");
  log("       vanta local-model downloads list|add|run|pause|resume|retry|cleanup");
  log("       Custom model: --model-id --model-url --sha256 --bytes --filename [--context]");
  return 1;
}

type Log = (line: string) => void;
type ApprovalState = { approved: boolean };

async function runStatus(root: string, json: boolean, log: Log): Promise<number> {
  const [checkpoint, receipts] = await Promise.all([readFirstInferenceCheckpoint(root), readFirstInferenceReceipts(root)]);
  log(json ? JSON.stringify({ checkpoint, receipts: receipts.slice(-8) }) : checkpoint ? `${checkpoint.status} · ${checkpoint.modelId}${checkpoint.failureCode ? ` · ${checkpoint.failureCode}` : ""}` : "not started");
  return checkpoint?.status === "failed" ? 1 : 0;
}

function setupContext(root: string, rest: string[], deps: LocalModelDeps, model: FirstInferenceModel) {
  const kernel = deps.kernel ?? createKernelClient(process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788", root);
  const approval: ApprovalState = { approved: rest.includes("--yes") };
  const confirm = deps.confirm ?? terminalConfirm;
  const lifecycle = createRuntimeLifecycleManager({
    root, assess: (action) => kernel.assess(action),
    requestApproval: async (_action, preview) => {
      if (approval.approved) return true;
      approval.approved = await confirm(`Launch ${preview.command} after the verified download? [y/N] `);
      return approval.approved;
    },
  });
  const wizard = (deps.createWizard ?? createFirstInferenceWizard)({ root, lifecycle, model, port: numberFlag(rest, "--port") });
  return { kernel, approval, confirm, wizard };
}

function emitPreview(preview: Awaited<ReturnType<ReturnType<typeof createFirstInferenceWizard>["preview"]>>, model: FirstInferenceModel, json: boolean, log: Log): void {
  const summary = {
    hardware: preview.hardware,
    recommendation: { id: model.id, label: model.label, downloadBytes: model.bytes, storageRequiredBytes: preview.storageRequiredBytes },
    launch: { command: preview.launch.command, args: preview.launch.args, resource: preview.launch.resource, approvalAction: preview.launch.approvalAction },
  };
  if (json) return log(JSON.stringify({ phase: "preview", ...summary }));
  log(`Hardware: ${preview.hardware.architecture} · ${formatBytes(preview.hardware.memoryBytes)} memory · ${formatBytes(preview.hardware.freeDiskBytes)} free`);
  log(`Recommended: ${model.label} · ${formatBytes(model.bytes)} download · ${formatBytes(preview.storageRequiredBytes)} storage required`);
  log(`Launch preview: ${preview.launch.command} ${preview.launch.args.join(" ")}`);
}

async function authorizeDownload(input: { kernel: KernelClient; model: FirstInferenceModel; approval: ApprovalState; confirm: (question: string) => Promise<boolean>; log: Log }): Promise<boolean> {
  const { kernel, model, approval, confirm, log } = input;
  const verdict = await kernel.assess(`download verified local model ${model.id} (${model.bytes} bytes, sha256 ${model.sha256})`);
  if (verdict.risk === "block") { log(`Kernel blocked model download: ${verdict.reason}`); return false; }
  if (verdict.risk === "ask" && !approval.approved) approval.approved = await confirm("Download the verified model and launch the local runtime? [y/N] ");
  if (verdict.risk === "ask" && !approval.approved) { log("Setup cancelled before download."); return false; }
  return true;
}

async function executeWizard(wizard: ReturnType<typeof createFirstInferenceWizard>, json: boolean, log: Log): Promise<number> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.once("SIGINT", cancel);
  try {
    const result = await wizard.run(controller.signal);
    const output = { status: result.checkpoint.status, model: result.model.label, runtime: result.runtime.status, response: result.response, receipt: ".vanta/first-inference/receipts.jsonl" };
    log(json ? JSON.stringify(output) : `\nVerified local result:\n${result.response}\n\nReceipt: ${output.receipt}`);
    return 0;
  } finally { process.removeListener("SIGINT", cancel); }
}

async function runSetup(root: string, rest: string[], deps: LocalModelDeps, log: Log): Promise<number> {
  let model: FirstInferenceModel;
  try { model = selectedModel(rest); }
  catch (error) { log(`Invalid model manifest: ${error instanceof Error ? error.message : String(error)}`); return 1; }
  const context = setupContext(root, rest, deps, model);
  const json = rest.includes("--json");

  try {
    const preview = await context.wizard.preview();
    emitPreview(preview, model, json, log);
    if (!preview.hardware.supported) { log(`Cannot continue: ${preview.hardware.reason}`); return 1; }
    if (!await authorizeDownload({ ...context, model, log })) return 1;
    return executeWizard(context.wizard, json, log);
  } catch (error) {
    log(`Local model setup failed: ${error instanceof Error ? error.message : String(error)}`);
    log("Retry the same command to resume from the durable checkpoint.");
    return 1;
  }
}

export async function runLocalModelCommand(root: string, rest: string[], deps: LocalModelDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [command = "setup"] = rest;
  if (command === "profiles") return runRuntimeProfileCommand(root, rest.slice(1), { log });
  if (command === "downloads") return runModelDownloadCommand(root, rest.slice(1), { log });
  if (command === "status") return runStatus(root, rest.includes("--json"), log);
  if (command !== "setup") return usage(log);
  return runSetup(root, rest, deps, log);
}
