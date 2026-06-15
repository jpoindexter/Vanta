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

type Source = "bundled" | "user" | "project";

type PluginCandidate = {
  source: Source;
  dir: string;
  manifest: PluginManifest;
};

export type PluginDiagnostic = { plugin: string; source: Source | "unknown"; ok: boolean; message: string };
export type PluginLoadResult = { loaded: string[]; diagnostics: PluginDiagnostic[] };

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
}): Promise<PluginLoadResult> {
  const enabled = new Set(opts.settings.plugins?.enabled ?? []);
  const diagnostics: PluginDiagnostic[] = [];
  const loaded: string[] = [];
  if (!enabled.size) return { loaded, diagnostics };

  let candidates: PluginCandidate[];
  try {
    candidates = await discoverPlugins(opts.repoRoot, opts.settings, opts.env);
  } catch (err) {
    return { loaded, diagnostics: [{ plugin: "(discovery)", source: "unknown", ok: false, message: (err as Error).message }] };
  }

  const byName = new Map(candidates.map((c) => [c.manifest.name, c]));
  for (const name of enabled) {
    const candidate = byName.get(name);
    if (!candidate) {
      diagnostics.push({ plugin: name, source: "unknown", ok: false, message: "enabled plugin not found" });
      continue;
    }
    const missingEnv = (candidate.manifest.requiresEnv ?? []).filter((key) => !opts.env[key]);
    if (missingEnv.length) {
      diagnostics.push({ plugin: name, source: candidate.source, ok: false, message: `missing env: ${missingEnv.join(", ")}` });
      continue;
    }
    const result = await loadOnePlugin(candidate, opts);
    diagnostics.push(result);
    if (result.ok) loaded.push(name);
  }
  return { loaded, diagnostics };
}

async function loadOnePlugin(candidate: PluginCandidate, opts: {
  repoRoot: string;
  registry: ToolRegistry;
  commands: PluginCommandRegistry;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<PluginDiagnostic> {
  try {
    const entry = resolve(candidate.dir, candidate.manifest.main);
    if (!entry.startsWith(candidate.dir)) throw new Error("plugin main must stay inside plugin directory");
    const mod = await import(pathToFileURL(entry).href) as PluginModule;
    const register = mod.register ?? mod.default?.register;
    if (typeof register !== "function") throw new Error("plugin module must export register(ctx)");
    const { ctx, contribution } = createPluginContext({
      manifest: candidate.manifest,
      pluginDir: candidate.dir,
      repoRoot: opts.repoRoot,
      vantaHome: resolveVantaHome(opts.env),
      registry: opts.registry,
      commands: opts.commands,
      log: opts.log ?? (() => {}),
    });
    await register(ctx);
    for (const tool of contribution.tools) opts.registry.register(tool);
    for (const command of contribution.commands) opts.commands.register(candidate.manifest.name, command.name, command.handler, command.meta);
    opts.log?.(`  · plugin: loaded ${candidate.manifest.name} (${contribution.tools.length} tool(s), ${contribution.commands.length} command(s))`);
    return { plugin: candidate.manifest.name, source: candidate.source, ok: true, message: "loaded" };
  } catch (err) {
    return { plugin: candidate.manifest.name, source: candidate.source, ok: false, message: (err as Error).message };
  }
}

