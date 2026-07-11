import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveVantaHome } from "../store/home.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Settings } from "../settings/store.js";
import type { PluginCommandRegistry } from "./commands.js";
import type { PluginManifest } from "./manifest.js";
import { parsePluginManifest } from "./manifest.js";
import { createPluginContext, type PluginContext } from "./context.js";
import { armMonitors, type DisarmHandle, type MonitorDeps } from "./monitors.js";
import { PluginPanelRegistry } from "./panels.js";
import { launchPluginWorker, type PluginWorkerHandle, type PluginWorkerScheduler } from "./worker.js";
import { createPluginLlmLane, type PluginLlmLane } from "./llm.js";
import { resolveRoutedProvider } from "../routing/model-router.js";

type Source = "bundled" | "user" | "project";

type PluginCandidate = {
  source: Source;
  dir: string;
  manifest: PluginManifest;
};

export type PluginDiagnostic = { plugin: string; source: Source | "unknown"; ok: boolean; message: string };
export type PluginLoadResult = {
  loaded: string[];
  diagnostics: PluginDiagnostic[];
  monitors: DisarmHandle[];
  workers: PluginWorkerHandle[];
  panels: PluginPanelRegistry;
};

// Real arming: interval monitors get a Node timer; `run` executes the monitor's
// shell command (best-effort, errors swallowed by armMonitors' fire wrapper).
function defaultMonitorDeps(log: (message: string) => void): MonitorDeps {
  return {
    schedule(intervalMs, fire) {
      const timer = setInterval(fire, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
      return () => clearInterval(timer);
    },
    run(monitor) {
      log(`  · monitor ${monitor.name}: tick`);
    },
  };
}

export type PluginModule = {
  register?: (ctx: PluginContext) => void | Promise<void>;
  default?: { register?: (ctx: PluginContext) => void | Promise<void> };
};

function bundledPluginsDir(): string {
  return fileURLToPath(new URL("../../plugins", import.meta.url));
}

async function readCandidateDir(source: Source, dir: string): Promise<PluginCandidate[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates: PluginCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(dir, entry.name);
    const raw = await readFile(join(pluginDir, "plugin.json"), "utf8").catch(() => "");
    if (!raw) continue;
    candidates.push({ source, dir: pluginDir, manifest: parsePluginManifest(JSON.parse(raw)) });
  }
  return candidates;
}

export async function discoverPlugins(repoRoot: string, settings: Settings, env: NodeJS.ProcessEnv): Promise<PluginCandidate[]> {
  const home = resolveVantaHome(env);
  const dirs: Array<[Source, string]> = [
    ["bundled", bundledPluginsDir()],
    ["user", join(home, "plugins")],
  ];
  if (env.VANTA_ENABLE_PROJECT_PLUGINS === "true" && settings.plugins?.trustProjectPlugins === true) {
    dirs.push(["project", join(repoRoot, ".vanta", "plugins")]);
  }

  const byName = new Map<string, PluginCandidate>();
  for (const [source, dir] of dirs) {
    for (const candidate of await readCandidateDir(source, dir)) byName.set(candidate.manifest.name, candidate);
  }
  return [...byName.values()];
}

export async function loadEnabledPlugins(opts: {
  repoRoot: string;
  registry: ToolRegistry;
  commands: PluginCommandRegistry;
  settings: Settings;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  monitorDeps?: MonitorDeps;
  panels?: PluginPanelRegistry;
  workerSchedule?: PluginWorkerScheduler;
  pluginLlmFactory?: (plugin: string) => PluginLlmLane;
}): Promise<PluginLoadResult> {
  const enabled = new Set(opts.settings.plugins?.enabled ?? []);
  const panels = opts.panels ?? new PluginPanelRegistry();
  const result: PluginLoadResult = { loaded: [], diagnostics: [], monitors: [], workers: [], panels };
  if (!enabled.size) return result;

  let candidates: PluginCandidate[];
  try {
    candidates = await discoverPlugins(opts.repoRoot, opts.settings, opts.env);
  } catch (err) {
    result.diagnostics.push({ plugin: "(discovery)", source: "unknown", ok: false, message: (err as Error).message });
    return result;
  }

  const byName = new Map(candidates.map((c) => [c.manifest.name, c]));
  for (const name of enabled) await loadEnabledCandidate(name, byName, opts, result);
  return result;
}

type LoadOneOptions = {
  repoRoot: string;
  registry: ToolRegistry;
  commands: PluginCommandRegistry;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  monitorDeps?: MonitorDeps;
  panels: PluginPanelRegistry;
  granted: import("./capabilities.js").PluginCapability[];
  workerSchedule?: PluginWorkerScheduler;
  pluginLlmFactory?: (plugin: string) => PluginLlmLane;
};
type LoadedOne = { diagnostic: PluginDiagnostic; monitors: DisarmHandle[]; worker?: PluginWorkerHandle };

async function loadEnabledCandidate(name: string, byName: Map<string, PluginCandidate>, opts: Parameters<typeof loadEnabledPlugins>[0], result: PluginLoadResult): Promise<void> {
  const candidate = byName.get(name);
  if (!candidate) return void result.diagnostics.push({ plugin: name, source: "unknown", ok: false, message: "enabled plugin not found" });
  const missingEnv = (candidate.manifest.requiresEnv ?? []).filter((key) => !opts.env[key]);
  if (missingEnv.length) return void result.diagnostics.push({ plugin: name, source: candidate.source, ok: false, message: `missing env: ${missingEnv.join(", ")}` });
  const loaded = await loadOnePlugin(candidate, { ...opts, panels: result.panels, granted: opts.settings.plugins?.capabilities?.[name] ?? [] });
  result.diagnostics.push(loaded.diagnostic);
  if (!loaded.diagnostic.ok) return;
  result.loaded.push(name);
  opts.commands.markLoaded(name);
  result.monitors.push(...loaded.monitors);
  if (loaded.worker) result.workers.push(loaded.worker);
}

async function loadOnePlugin(candidate: PluginCandidate, opts: LoadOneOptions): Promise<LoadedOne> {
  const log = opts.log ?? (() => {});
  const llm = opts.pluginLlmFactory?.(candidate.manifest.name) ?? defaultPluginLlm(candidate.manifest.name, opts.repoRoot, opts.env, opts.granted);
  try {
    return await (candidate.manifest.worker ? loadWorkerPlugin(candidate, opts, log) : loadContextPlugin(candidate, opts, log, llm));
  } catch (err) {
    return { diagnostic: { plugin: candidate.manifest.name, source: candidate.source, ok: false, message: (err as Error).message }, monitors: [] };
  }
}

async function loadWorkerPlugin(candidate: PluginCandidate, opts: LoadOneOptions, log: (message: string) => void): Promise<LoadedOne> {
  const worker = await launchPluginWorker({
    manifest: candidate.manifest, pluginDir: candidate.dir, vantaHome: resolveVantaHome(opts.env),
    granted: opts.granted, panels: opts.panels, log, schedule: opts.workerSchedule,
  });
  const monitors = armMonitors(candidate.manifest, opts.monitorDeps ?? defaultMonitorDeps(log));
  log(`  · plugin: loaded ${candidate.manifest.name} worker (pid ${worker.pid}, ${worker.granted.length} capability grant(s))`);
  return { diagnostic: { plugin: candidate.manifest.name, source: candidate.source, ok: true, message: "worker loaded" }, monitors, worker };
}

async function loadContextPlugin(candidate: PluginCandidate, opts: LoadOneOptions, log: (message: string) => void, llm: PluginLlmLane): Promise<LoadedOne> {
  const entry = resolve(candidate.dir, candidate.manifest.main);
  if (!entry.startsWith(candidate.dir)) throw new Error("plugin main must stay inside plugin directory");
  const mod = await import(pathToFileURL(entry).href) as PluginModule;
  const register = mod.register ?? mod.default?.register;
  if (typeof register !== "function") throw new Error("plugin module must export register(ctx)");
  const { ctx, contribution } = createPluginContext({
    manifest: candidate.manifest, pluginDir: candidate.dir, repoRoot: opts.repoRoot,
    vantaHome: resolveVantaHome(opts.env), registry: opts.registry, commands: opts.commands, log, llm,
  });
  await register(ctx);
  for (const tool of contribution.tools) opts.registry.register(tool);
  for (const command of contribution.commands) opts.commands.register(candidate.manifest.name, command.name, command.handler, command.meta);
  const monitors = armMonitors(candidate.manifest, opts.monitorDeps ?? defaultMonitorDeps(log));
  if (monitors.length) log(`  · plugin ${candidate.manifest.name}: armed ${monitors.length} monitor(s)`);
  log(`  · plugin: loaded ${candidate.manifest.name} (${contribution.tools.length} tool(s), ${contribution.commands.length} command(s))`);
  return { diagnostic: { plugin: candidate.manifest.name, source: candidate.source, ok: true, message: "loaded" }, monitors };
}

function defaultPluginLlm(plugin: string, repoRoot: string, env: NodeJS.ProcessEnv, granted: readonly string[] = []): PluginLlmLane {
  if (!granted.includes("llm.generate")) return deniedPluginLlm();
  const configured = Number(env.VANTA_PLUGIN_LLM_MAX_USD ?? "0.05");
  const hostBudgetUsd = Number.isFinite(configured) && configured > 0 ? configured : 0.05;
  return createPluginLlmLane({
    plugin, dataDir: join(repoRoot, ".vanta"), hostBudgetUsd,
    provider: (purpose) => resolveRoutedProvider(env, purpose),
  });
}

function deniedPluginLlm(): PluginLlmLane {
  const denied = async (): Promise<never> => { throw new Error("plugin needs the llm.generate capability grant"); };
  return { complete: denied, completeStructured: denied };
}
