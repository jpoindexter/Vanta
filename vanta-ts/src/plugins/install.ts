import { mkdtemp, mkdir, readFile, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveVantaHome } from "../store/home.js";
import { parsePluginManifest, type PluginManifest } from "./manifest.js";

// VANTA-PLUGIN-URL: install a plugin from a URL .zip or a local dir/.zip.
// This stages verified plugin code into ~/.vanta/plugins/<name>; it NEVER
// enables the plugin (plugins.enabled is the operator allow-list / trust gate).
// A staged-but-disabled plugin is inert: loadEnabledPlugins only loads names in
// plugins.enabled, so downloaded code never runs until the operator opts in.

const runExec = promisify(execFile);

export type PluginInstallResult = {
  name: string;
  /** Staged plugin directory under ~/.vanta/plugins. */
  dir: string;
  /** True when the plugin name is already in settings.plugins.enabled. */
  enabled: boolean;
  manifest: PluginManifest;
};

/** Injectable IO so tests never touch the network or the real unzip binary. */
export type InstallDeps = {
  /** Fetch a remote .zip into `dest` (a file path). */
  fetchZip: (url: string, dest: string) => Promise<void>;
  /** Extract `zip` into directory `dir`. */
  extractZip: (zip: string, dir: string) => Promise<void>;
  /** Resolve the Vanta home; defaults to resolveVantaHome(env). */
  vantaHome: (env: NodeJS.ProcessEnv) => string;
};

/** Default network fetch (native fetch, Node 22+) writing the body to disk. */
async function defaultFetchZip(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Default extractor: shells out to the system `unzip` (guarded by isUnzipAvailable). */
async function defaultExtractZip(zip: string, dir: string): Promise<void> {
  if (!(await isUnzipAvailable())) {
    throw new Error("no `unzip` binary found; install unzip or use --plugin-dir with an unpacked directory");
  }
  await runExec("unzip", ["-q", "-o", zip, "-d", dir], { timeout: 60_000 });
}

/** Whether the system `unzip` binary is callable. Cached per process. */
let unzipAvailable: boolean | undefined;
export async function isUnzipAvailable(): Promise<boolean> {
  if (unzipAvailable !== undefined) return unzipAvailable;
  try {
    await runExec("unzip", ["-v"], { timeout: 10_000 });
    unzipAvailable = true;
  } catch {
    unzipAvailable = false;
  }
  return unzipAvailable;
}

export const DEFAULT_INSTALL_DEPS: InstallDeps = {
  fetchZip: defaultFetchZip,
  extractZip: defaultExtractZip,
  vantaHome: (env) => resolveVantaHome(env),
};

/** Read + verify plugin.json from a directory. Throws on missing/malformed. */
export async function verifyPluginDir(dir: string): Promise<PluginManifest> {
  const raw = await readFile(join(dir, "plugin.json"), "utf8").catch(() => {
    throw new Error(`no plugin.json in ${dir}`);
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`plugin.json is not valid JSON in ${dir}`);
  }
  return parsePluginManifest(parsed);
}

/** True when `path` is an existing directory. */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Materialize the plugin source into a verified staging directory and return
 * it with its manifest. The source is one of:
 *   - a remote URL → fetched .zip → extracted
 *   - a local .zip path → extracted
 *   - a local directory → used as-is
 * A single nested top-level dir inside an archive is unwrapped.
 */
async function materializeSource(
  source: { url?: string; dir?: string },
  deps: InstallDeps,
): Promise<{ srcDir: string; manifest: PluginManifest; cleanup: () => Promise<void> }> {
  if (source.dir && (await isDirectory(source.dir))) {
    const dir = resolve(source.dir);
    return { srcDir: dir, manifest: await verifyPluginDir(dir), cleanup: async () => {} };
  }
  const work = await mkdtemp(join(tmpdir(), "vanta-plugin-stage-"));
  const cleanup = async (): Promise<void> => { await rm(work, { recursive: true, force: true }).catch(() => {}); };
  try {
    const zip = source.url ? join(work, "plugin.zip") : resolve(source.dir ?? "");
    if (source.url) await deps.fetchZip(source.url, zip);
    else if (!existsSync(zip)) throw new Error(`no such plugin source: ${source.dir}`);
    const out = join(work, "extracted");
    await mkdir(out, { recursive: true });
    await deps.extractZip(zip, out);
    const srcDir = await unwrapSingleDir(out);
    return { srcDir, manifest: await verifyPluginDir(srcDir), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** If `dir` contains exactly one subdirectory and no plugin.json, descend into it. */
async function unwrapSingleDir(dir: string): Promise<string> {
  if (existsSync(join(dir, "plugin.json"))) return dir;
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const only = dirs[0];
  if (entries.length === 1 && only) return join(dir, only.name);
  return dir;
}

/**
 * Install a plugin from a URL .zip or a local dir/.zip into ~/.vanta/plugins.
 * Verifies the manifest, stages the code, and reports whether it is enabled.
 * It NEVER mutates plugins.enabled — staging is not trust. Returns the result
 * so the caller can tell the operator how to enable it.
 */
export async function installPlugin(
  source: { url?: string; dir?: string },
  opts: { env: NodeJS.ProcessEnv; enabled: string[]; deps?: InstallDeps },
): Promise<PluginInstallResult> {
  if (!source.url && !source.dir) throw new Error("installPlugin needs a url or dir");
  const deps = opts.deps ?? DEFAULT_INSTALL_DEPS;
  const { srcDir, manifest, cleanup } = await materializeSource(source, deps);
  try {
    const pluginsRoot = join(deps.vantaHome(opts.env), "plugins");
    const dir = join(pluginsRoot, manifest.name);
    await mkdir(pluginsRoot, { recursive: true });
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await cp(srcDir, dir, { recursive: true });
    return { name: manifest.name, dir, enabled: opts.enabled.includes(manifest.name), manifest };
  } finally {
    await cleanup();
  }
}
