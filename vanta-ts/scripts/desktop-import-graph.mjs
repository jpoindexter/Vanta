#!/usr/bin/env node
// Reports what `cli.ts` loads eagerly (static imports) in the runtime bundle.
//   node scripts/desktop-import-graph.mjs [--inputs] [--entry src/desktop/server.ts]
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeEager } from "./lib/eager-graph.mjs";
import { buildRuntimeBundle } from "./lib/runtime-bundle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = await mkdtemp(join(tmpdir(), "vanta-graph-"));
try {
  const entryArg = process.argv.indexOf("--entry");
  const entryPath = entryArg >= 0 ? process.argv[entryArg + 1] : undefined;
  const entries = entryPath ? { entry: resolve(root, entryPath) } : undefined;
  const { metafile } = await buildRuntimeBundle({ root, outDir, entries });
  const eager = summarizeEager(metafile, entryPath ? "entry.mjs" : "cli.mjs");
  const dirs = new Map();
  for (const input of eager.inputs) {
    const key = input.split("/").slice(0, 2).join("/");
    dirs.set(key, (dirs.get(key) ?? 0) + 1);
  }
  console.log(`eager chunks ${eager.chunks}/${eager.totalChunks}, ${eager.bytes} bytes, ${eager.inputs.length} source modules`);
  console.log(`eager npm packages (${eager.packages.length}): ${eager.packages.join(" ")}`);
  console.log([...dirs].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([dir, count]) => `${String(count).padStart(5)} ${dir}`).join("\n"));
  if (process.argv.includes("--inputs")) console.log(eager.inputs.join("\n"));
} finally {
  await rm(outDir, { recursive: true, force: true });
}
