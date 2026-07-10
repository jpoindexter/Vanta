import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { PLUGIN_CAPABILITIES, type PluginCapability } from "./capabilities.js";
import type { PluginManifest } from "./manifest.js";
import { PluginPanelRegistry } from "./panels.js";

const HostRequestSchema = z.object({
  type: z.literal("host.request"),
  id: z.string().min(1).max(128),
  capability: z.enum(PLUGIN_CAPABILITIES),
  method: z.string().min(1).max(80),
  params: z.unknown().optional(),
}).strict();

const ReadySchema = z.object({ type: z.literal("ready") }).strict();
const LogParams = z.object({ message: z.string().max(2_000) }).strict();
const StorageGetParams = z.object({ key: z.string().min(1).max(128) }).strict();
const StorageSetParams = z.object({ key: z.string().min(1).max(128), value: z.unknown() }).strict();
const ScheduleParams = z.object({ name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), intervalMs: z.number().int().min(1_000) }).strict();
const PanelParams = z.object({ panel: z.unknown() }).strict();

export type PluginWorkerScheduler = (intervalMs: number, fire: () => void) => () => void;

export type PluginWorkerHandle = {
  plugin: string;
  pid: number;
  granted: PluginCapability[];
  dispose: () => void;
};

export type LaunchPluginWorkerOptions = {
  manifest: PluginManifest;
  pluginDir: string;
  vantaHome: string;
  granted: readonly PluginCapability[];
  panels: PluginPanelRegistry;
  log?: (message: string) => void;
  schedule?: PluginWorkerScheduler;
  startupTimeoutMs?: number;
};

function containedEntry(pluginDir: string, main: string): string {
  const entry = resolve(pluginDir, main);
  const rel = relative(pluginDir, entry);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("plugin worker main must stay inside plugin directory");
  return entry;
}

function permissionArgs(pluginDir: string, entry: string): string[] {
  const flags = process.allowedNodeEnvironmentFlags;
  const permission = flags.has("--permission")
    ? "--permission"
    : flags.has("--experimental-permission")
      ? "--experimental-permission"
      : null;
  if (!permission) throw new Error("plugin workers require a Node runtime with the permission model");
  return [permission, `--allow-fs-read=${pluginDir}`, entry];
}

function workerEnv(name: string): NodeJS.ProcessEnv {
  const keep = ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"] as const;
  const env: NodeJS.ProcessEnv = { NODE_NO_WARNINGS: "1", VANTA_PLUGIN_NAME: name };
  for (const key of keep) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function defaultSchedule(intervalMs: number, fire: () => void): () => void {
  const timer = setInterval(fire, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

function writeMessage(child: ChildProcessWithoutNullStreams, message: unknown): void {
  if (child.stdin.destroyed) return;
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function readPluginStorage(home: string, plugin: string): Promise<Record<string, unknown>> {
  const path = join(home, "plugin-data", `${plugin}.json`);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function writePluginStorage(home: string, plugin: string, value: Record<string, unknown>): Promise<void> {
  const dir = join(home, "plugin-data");
  const path = join(dir, `${plugin}.json`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function launchPluginWorker(opts: LaunchPluginWorkerOptions): Promise<PluginWorkerHandle> {
  const worker = opts.manifest.worker;
  if (!worker) throw new Error(`plugin ${opts.manifest.name} has no worker declaration`);
  const pluginDir = realpathSync(opts.pluginDir);
  const entry = containedEntry(pluginDir, worker.main);
  const declared = new Set(worker.capabilities);
  const granted = [...new Set(opts.granted)].filter((capability) => declared.has(capability));
  const allowed = new Set(granted);
  const log = opts.log ?? (() => {});
  const child = spawn(process.execPath, permissionArgs(pluginDir, entry), {
    cwd: pluginDir,
    env: workerEnv(opts.manifest.name),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const jobs = new Map<string, () => void>();
  const schedule = opts.schedule ?? defaultSchedule;
  const lines = createInterface({ input: child.stdout });
  let settled = false;
  let disposed = false;
  let processing = Promise.resolve();
  let stderr = "";

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    process.removeListener("exit", killOnExit);
    for (const stop of jobs.values()) stop();
    jobs.clear();
    opts.panels.removePlugin(opts.manifest.name);
    lines.close();
    child.kill();
  };
  const killOnExit = (): void => dispose();
  process.once("exit", killOnExit);

  const result = await new Promise<PluginWorkerHandle>((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      dispose();
      rejectReady(new Error(`plugin worker ${opts.manifest.name} did not become ready`));
    }, opts.startupTimeoutMs ?? 5_000);
    timeout.unref();

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      dispose();
      rejectReady(error);
    };

    child.once("error", fail);
    child.once("exit", (code, signal) => {
      const detail = stderr.trim() ? `: ${stderr.trim().slice(-2_000)}` : "";
      if (!settled) fail(new Error(`plugin worker ${opts.manifest.name} exited before ready (${signal ?? code ?? "unknown"})${detail}`));
      else if (!disposed) log(`  · plugin ${opts.manifest.name}: worker exited (${signal ?? code ?? "unknown"})`);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4_000);
      log(`  · plugin ${opts.manifest.name} worker: ${String(chunk).trimEnd()}`);
    });
    lines.on("line", (line) => {
      processing = processing.then(async () => {
        let raw: unknown;
        try { raw = JSON.parse(line); }
        catch { return void log(`  · plugin ${opts.manifest.name}: ignored malformed worker message`); }
        const ready = ReadySchema.safeParse(raw);
        if (ready.success) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          const pid = child.pid;
          if (!pid) {
            dispose();
            return rejectReady(new Error(`plugin worker ${opts.manifest.name} has no process id`));
          }
          resolveReady({ plugin: opts.manifest.name, pid, granted, dispose });
          return;
        }
        const parsed = HostRequestSchema.safeParse(raw);
        if (!parsed.success) return void log(`  · plugin ${opts.manifest.name}: ignored invalid worker request`);
        const request = parsed.data;
        try {
          if (!declared.has(request.capability)) throw new Error(`capability ${request.capability} is not declared`);
          if (!allowed.has(request.capability)) throw new Error(`capability ${request.capability} is not granted`);
          const value = await serveHostRequest(request.capability, request.method, request.params, {
            plugin: opts.manifest.name, home: opts.vantaHome, log, panels: opts.panels, jobs, schedule,
            send: (message) => writeMessage(child, message),
          });
          writeMessage(child, { type: "host.response", id: request.id, ok: true, value });
        } catch (error) {
          writeMessage(child, { type: "host.response", id: request.id, ok: false, error: (error as Error).message });
        }
      }).catch((error) => log(`  · plugin ${opts.manifest.name}: worker request failed: ${(error as Error).message}`));
    });
    writeMessage(child, {
      type: "init",
      protocol: 1,
      plugin: { name: opts.manifest.name, version: opts.manifest.version },
      granted,
    });
  });

  child.unref();
  (child.stdout as typeof child.stdout & { unref?: () => void }).unref?.();
  (child.stderr as typeof child.stderr & { unref?: () => void }).unref?.();
  (child.stdin as typeof child.stdin & { unref?: () => void }).unref?.();
  return result;
}

type HostRequestDeps = {
  plugin: string;
  home: string;
  log: (message: string) => void;
  panels: PluginPanelRegistry;
  jobs: Map<string, () => void>;
  schedule: PluginWorkerScheduler;
  send: (message: unknown) => void;
};

async function serveHostRequest(capability: PluginCapability, method: string, params: unknown, deps: HostRequestDeps): Promise<unknown> {
  if (capability === "log.write" && method === "write") {
    const { message } = LogParams.parse(params);
    deps.log(`  · plugin ${deps.plugin}: ${message}`);
    return { written: true };
  }
  if (capability === "storage.read" && method === "get") {
    const { key } = StorageGetParams.parse(params);
    return { value: (await readPluginStorage(deps.home, deps.plugin))[key] ?? null };
  }
  if (capability === "storage.write" && method === "set") {
    const { key, value } = StorageSetParams.parse(params);
    const current = await readPluginStorage(deps.home, deps.plugin);
    current[key] = value;
    await writePluginStorage(deps.home, deps.plugin, current);
    return { written: true };
  }
  if (capability === "schedule.jobs" && method === "register") {
    const { name, intervalMs } = ScheduleParams.parse(params);
    deps.jobs.get(name)?.();
    deps.jobs.set(name, deps.schedule(intervalMs, () => deps.send({ type: "job", name, at: new Date().toISOString() })));
    return { scheduled: name, intervalMs };
  }
  if (capability === "ui.panel" && method === "register") {
    const { panel } = PanelParams.parse(params);
    return deps.panels.register(deps.plugin, panel);
  }
  throw new Error(`unsupported host service ${capability}.${method}`);
}
