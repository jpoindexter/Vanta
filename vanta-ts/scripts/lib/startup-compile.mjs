import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const VERSION = 1;
const DEFAULT_INPUTS = ["src", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.runtime.json"];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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

async function cacheHit(root, outputRoot, inputs) {
  try {
    const saved = JSON.parse(await readFile(join(outputRoot, "manifest.json"), "utf8"));
    if (saved.version !== VERSION || !Array.isArray(saved.sources)) return false;
    if (!await exists(join(outputRoot, "src", "cli.js"))) return false;
    return JSON.stringify(saved.sources) === JSON.stringify(await startupManifest(root, inputs));
  } catch {
    return false;
  }
}

export async function ensureStartupCompile(options) {
  const root = resolve(options.root);
  const outputRoot = resolve(options.outputRoot ?? join(root, ".startup-cache"));
  const inputs = options.inputs ?? DEFAULT_INPUTS;
  if (await cacheHit(root, outputRoot, inputs)) return { status: "hit", outputRoot };

  const staging = `${outputRoot}.next-${process.pid}`;
  const backup = `${outputRoot}.previous-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    await options.build(staging);
    const sources = await startupManifest(root, inputs);
    await writeFile(
      join(staging, "manifest.json"),
      `${JSON.stringify({ version: VERSION, sources })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  let movedCurrent = false;
  try {
    if (await exists(outputRoot)) {
      await rm(backup, { recursive: true, force: true });
      await rename(outputRoot, backup);
      movedCurrent = true;
    }
    await rename(staging, outputRoot);
    if (movedCurrent) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!await exists(outputRoot) && movedCurrent && await exists(backup)) await rename(backup, outputRoot);
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { status: "built", outputRoot };
}
