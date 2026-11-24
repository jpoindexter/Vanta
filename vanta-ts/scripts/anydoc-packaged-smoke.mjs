import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = resolve(root, "release/mac-arm64/Vanta.app");
const executable = resolve(app, "Contents/MacOS/Vanta");
const resources = resolve(app, "Contents/Resources");
const worker = resolve(resources, "app.asar/src/documents/anydoc-worker.mjs");
const native = resolve(resources, "app.asar.unpacked/node_modules/@firecrawl/anydoc-darwin-arm64/anydoc.darwin-arm64.node");

if (!existsSync(executable)) throw new Error(`packaged Vanta executable missing: ${executable}`);
if (!existsSync(native)) throw new Error(`packaged AnyDoc native binding missing: ${native}`);

const result = spawnSync(executable, [worker, ".csv"], {
  input: "name,value\nVanta,packaged-local\n",
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
  },
  timeout: 30_000,
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`packaged AnyDoc exited ${result.status}: ${result.stderr.trim()}`);
if (!result.stdout.includes("Vanta") || !result.stdout.includes("packaged-local")) {
  throw new Error("packaged AnyDoc output did not contain the expected document content");
}

console.log("PASS packaged local AnyDoc conversion");
