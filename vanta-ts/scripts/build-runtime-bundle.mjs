#!/usr/bin/env node
// Precompile src/cli.ts to dist-runtime/ so the desktop runtime starts from
// plain JavaScript instead of transpiling TypeScript through tsx on every launch.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeBundle } from "./lib/runtime-bundle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const started = performance.now();
const { entry, metafile } = await buildRuntimeBundle({ root, sourcemap: process.argv.includes("--sourcemap") });
const files = Object.keys(metafile.outputs).filter((file) => file.endsWith(".mjs")).length;
console.log(`runtime bundle: ${entry} (${files} chunks, ${Math.round(performance.now() - started)}ms)`);
