import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { defaultExec } from "../secrets/provider.js";
import { createModelDownloadQueue, type CreateModelDownload, type ModelDownloadQueue } from "../model-download/index.js";

type Log = (line: string) => void;
type DownloadCommandDeps = {
  log?: Log;
  queue?: ModelDownloadQueue;
};
type CommandContext = { queue: ModelDownloadQueue; args: string[]; json: boolean; log: Log };
type CommandHandler = (context: CommandContext) => Promise<number>;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const value = flag(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function usage(log: Log): number {
  log("Usage: vanta local-model downloads list [--json]");
  log("       vanta local-model downloads add --id <id> --label <name> --url <hf-url> --sha256 <hash> --bytes <n> --filename <file> [--storage <dir>] [--auth-ref <secret://name>] [--profile <id>] [--start]");
  log("       vanta local-model downloads run|resume|retry|pause <id> [--json]");
  log("       vanta local-model downloads cleanup <id> --confirm");
  return 1;
}

function queueFor(root: string): ModelDownloadQueue {
  return createModelDownloadQueue({
    root,
    resolveSecret: async (reference, job) => {
      const name = reference.slice("secret://".length);
      return resolveVaultSecretValue(name, `model-download:${job.id}`, process.env, defaultExec);
    },
  });
}

function createInput(args: string[]): CreateModelDownload {
  const bytes = Number(required(args, "--bytes"));
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("--bytes must be a positive integer");
  return {
    id: required(args, "--id"),
    label: required(args, "--label"),
    source: {
      kind: "hugging_face",
      url: required(args, "--url"),
      sha256: required(args, "--sha256"),
      bytes,
      filename: required(args, "--filename"),
      ...(flag(args, "--auth-ref") ? { authSecretRef: flag(args, "--auth-ref") } : {}),
      ...(flag(args, "--manifest-url") ? { manifestUrl: flag(args, "--manifest-url") } : {}),
    },
    ...(flag(args, "--storage") ? { storageRoot: flag(args, "--storage") } : {}),
    ...(flag(args, "--profile") ? { profileId: flag(args, "--profile") } : {}),
  };
}

function emit(value: unknown, json: boolean, log: Log): void {
  if (json) return log(JSON.stringify(value));
  if (Array.isArray(value)) {
    if (!value.length) return log("No model downloads queued.");
    for (const item of value as Array<{ id: string; status: string; downloadedBytes: number; source: { bytes: number }; destination: string }>) {
      log(`${item.id} · ${item.status} · ${item.downloadedBytes}/${item.source.bytes} bytes · ${item.destination}`);
    }
    return;
  }
  const item = value as { id?: string; status?: string; downloadedBytes?: number; source?: { bytes: number }; destination?: string; duplicate?: boolean; job?: unknown };
  if (item.job) return emit(item.job, json, log);
  log(`${item.id} · ${item.status} · ${item.downloadedBytes}/${item.source?.bytes} bytes · ${item.destination}`);
}

async function runWithPause(queue: ModelDownloadQueue, id: string, action: "run" | "resume" | "retry") {
  const pause = (): void => { void queue.pause(id); };
  process.once("SIGINT", pause);
  try { return await queue[action](id); }
  finally { process.removeListener("SIGINT", pause); }
}

async function listCommand({ queue, json, log }: CommandContext): Promise<number> {
  emit(await queue.list(), json, log); return 0;
}

async function addCommand({ queue, args, json, log }: CommandContext): Promise<number> {
  const result = await queue.enqueue(createInput(args));
  const job = args.includes("--start") ? await runWithPause(queue, result.job.id, "run") : result.job;
  emit(job, json, log);
  return job.status === "failed" ? 1 : 0;
}

function idFrom(args: string[]): string {
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id) throw new Error("download id is required");
  return id;
}

async function pauseCommand({ queue, args, json, log }: CommandContext): Promise<number> {
  emit(await queue.pause(idFrom(args)), json, log); return 0;
}

async function cleanupCommand({ queue, args, json, log }: CommandContext): Promise<number> {
  emit(await queue.cleanup(idFrom(args), args.includes("--confirm")), json, log); return 0;
}

function lifecycleCommand(action: "run" | "resume" | "retry"): CommandHandler {
  return async ({ queue, args, json, log }) => {
    const job = await runWithPause(queue, idFrom(args), action);
    emit(job, json, log);
    return job.status === "completed" || job.status === "paused" ? 0 : 1;
  };
}

const COMMANDS: Record<string, CommandHandler> = {
  list: listCommand,
  add: addCommand,
  pause: pauseCommand,
  cleanup: cleanupCommand,
  run: lifecycleCommand("run"),
  resume: lifecycleCommand("resume"),
  retry: lifecycleCommand("retry"),
};

export async function runModelDownloadCommand(root: string, rest: string[], deps: DownloadCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const queue = deps.queue ?? queueFor(root);
  const [command = "list", ...args] = rest;
  const json = args.includes("--json");
  const handler = COMMANDS[command];
  if (!handler) return usage(log);
  try {
    return await handler({ queue, args, json, log });
  } catch (error) {
    log(`Model download ${command} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
