import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const VERSION = 1;
export const STARTUP_RUNTIME_ASSETS = ["desktop-native/runtime-fetch-init.mjs", "desktop-native/maintained-fetch.mjs"];
const DEFAULT_INPUTS = ["src", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.runtime.json", ...STARTUP_RUNTIME_ASSETS];
const REQUIRED_OUTPUTS = ["src/cli.js", ...STARTUP_RUNTIME_ASSETS];

async function currentGeneration(outputRoot) {
  try {
    const generation = JSON.parse(await readFile(join(outputRoot, "current.json"), "utf8"));
    return typeof generation === "string" && /^generation-[A-Za-z0-9]+$/.test(generation)
      ? join(outputRoot, generation) : null;
  } catch {
    return null;
  }
}

async function collect(path, root, out) {
  let info;
  try {
    info = await stat(path);
  } catch {
    out.push({ path: relative(root, path), kind: "missing", size: null, mtimeMs: null });
    return;
  }
  const rel = relative(root, path);
  out.push({
    path: rel,
    kind: info.isDirectory() ? "directory" : "file",
    size: info.size,
    mtimeMs: info.mtimeMs,
  });
  if (!info.isDirectory()) return;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".startup-cache") continue;
    await collect(join(path, entry.name), root, out);
  }
}

export async function startupManifest(root, inputs = DEFAULT_INPUTS) {
  const absoluteRoot = resolve(root);
  const out = [];
  for (const input of inputs) await collect(resolve(absoluteRoot, input), absoluteRoot, out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function missingRequiredOutputs(outputRoot) {
  const missing = [];
  for (const file of REQUIRED_OUTPUTS) {
    const valid = await stat(join(outputRoot, file)).then(info => info.isFile(), () => false);
    if (!valid) missing.push(file);
  }
  return missing;
}

async function cacheHit(root, outputRoot, inputs) {
  try {
    const saved = JSON.parse(await readFile(join(outputRoot, "manifest.json"), "utf8"));
    if (saved.version !== VERSION || !Array.isArray(saved.sources)) return false;
    if ((await missingRequiredOutputs(outputRoot)).length) return false;
    return JSON.stringify(saved.sources) === JSON.stringify(await startupManifest(root, inputs));
  } catch {
    return false;
  }
}

async function buildStaging({ root, staging, inputs, build }) {
  try {
    const sources = await startupManifest(root, inputs);
    await build(staging);
    const missing = await missingRequiredOutputs(staging);
    if (missing.length) throw new Error(`missing required startup output: ${missing.join(", ")}`);
    if (JSON.stringify(sources) !== JSON.stringify(await startupManifest(root, inputs))) {
      throw new Error("source changed during startup compilation");
    }
    await writeFile(
      join(staging, "manifest.json"),
      `${JSON.stringify({ version: VERSION, sources })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function ensureStartupCompile(options) {
  const root = resolve(options.root);
  const outputRoot = resolve(options.outputRoot ?? join(root, ".startup-cache"));
  const inputs = options.inputs ?? DEFAULT_INPUTS;
  const current = await currentGeneration(outputRoot);
  if (current && await cacheHit(root, current, inputs)) return { status: "hit", outputRoot: current };

  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(outputRoot, "generation-"));
  await buildStaging({ root, staging, inputs, build: options.build });

  try {
    await writeFile(join(staging, "current.json"), JSON.stringify(basename(staging)), { mode: 0o600 });
    await rename(join(staging, "current.json"), join(outputRoot, "current.json"));
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  // Old generations may still serve a live process's dynamic imports.
  return { status: "built", outputRoot: staging };
}
