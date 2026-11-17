// Runs the receipts-and-queue proof N times, each in fresh isolated state, and reports pass counts per step.
//
//   node tools/receipts-queue-proof/flake.mjs [--runs 5] [--out docs/proofs/receipts-queue/flake]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const runs = Number(option("--runs", "5"));
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "receipts-queue", "flake")));
const script = path.join(import.meta.dirname, "run.mjs");
const RUN_TIMEOUT_MS = 5 * 60_000;

function oneRun(index) {
  const dir = path.join(outDir, `run-${String(index).padStart(2, "0")}`);
  const started = Date.now();
  const child = spawnSync(process.execPath, [script, "--out", dir, ...(index === 1 ? [] : ["--no-shots"])], { encoding: "utf8", timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const line = (child.stdout ?? "").split("\n").reverse().find((l) => l.startsWith("{"));
  let result = null;
  try { result = line ? JSON.parse(line) : null; } catch { result = null; }
  const seconds = Math.round((Date.now() - started) / 1000);
  return result ? { index, seconds, ...result } : { index, seconds, crash: `no result (exit ${child.status}): ${(child.stderr ?? "").trim().split("\n").slice(-2).join(" ").slice(0, 300)}` };
}

function markdown(results) {
  const ids = [...new Set(results.flatMap((r) => (r.steps ?? []).map((s) => s.id)))];
  const full = results.filter((r) => r.pass).length;
  const lines = ["# Receipts and queue proof: repeated runs", "", `Runs: ${results.length}. Runs where every step passed: ${full}/${results.length}. Crashed: ${results.filter((r) => r.crash).length}.`, "", "| step | passed | what |", "|---|---|---|"];
  for (const id of ids) {
    const seen = results.flatMap((r) => (r.steps ?? []).filter((s) => s.id === id));
    lines.push(`| ${id} | ${seen.filter((s) => s.status === "PASS").length}/${results.length} | ${seen[0]?.title} |`);
  }
  lines.push("", "Failure messages:", "");
  for (const r of results) for (const s of (r.steps ?? []).filter((x) => x.status === "FAIL")) lines.push(`- run ${r.index}, ${s.id}: ${s.error}`);
  for (const r of results.filter((x) => x.crash)) lines.push(`- run ${r.index}: ${r.crash}`);
  lines.push("", `Seconds per run: ${results.map((r) => r.seconds).join(", ")}`);
  return `${lines.join("\n")}\n`;
}

fs.mkdirSync(outDir, { recursive: true });
const results = [];
for (let index = 1; index <= runs; index += 1) {
  const result = oneRun(index);
  results.push(result);
  console.log(`run ${index}/${runs}: ${result.crash ? `CRASH ${result.crash}` : result.pass ? "all PASS" : `FAIL ${result.steps.filter((s) => s.status !== "PASS").map((s) => s.id).join(",")}`} (${result.seconds}s)`);
}
fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "summary.md"), markdown(results));
console.log(markdown(results));
