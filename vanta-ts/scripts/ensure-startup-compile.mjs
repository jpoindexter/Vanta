#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ensureStartupCompile } from "./lib/startup-compile.mjs";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = ["skills-library", "plugins", "automation-blueprints", "blueprints", "docker"];
const packagedCompiler = typeof process.resourcesPath === "string"
  ? join(process.resourcesPath, "typescript", "node_modules", "@typescript", "native", "bin", "tsc")
  : "";
const compiler = packagedCompiler && existsSync(packagedCompiler)
  ? packagedCompiler
  : join(root, "node_modules", "@typescript", "native", "bin", "tsc");

await ensureStartupCompile({
  root,
  build: async (staging) => {
    await exec(process.execPath, [
      compiler,
      "-p",
      join(root, "tsconfig.runtime.json"),
      "--outDir",
      staging,
    ], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    await cp(join(root, "package.json"), join(staging, "package.json"));
    for (const asset of assets) {
      await cp(join(root, asset), join(staging, asset), { recursive: true, force: true }).catch(() => {});
    }
    await copyRuntimeAssets(join(root, "src"), join(staging, "src"));
  },
});

async function copyRuntimeAssets(source, target) {
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyRuntimeAssets(from, to);
    } else if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to);
    }
  }
}
