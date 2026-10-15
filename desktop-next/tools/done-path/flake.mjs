// Flake measurement: runs the whole done-path script N times, each in fresh isolated state,
// and reports pass rate per step and overall, plus every distinct failure message.
//
//   node tools/done-path/flake.mjs [--runs 20] [--out docs/proofs/done-path/flake] [--script tools/company-proof/run.mjs] [--keep]
// --keep leaves the sandbox (runtime, kernel and app logs) of every run that did not fully pass, and prints its path.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const runs = Number(option("--runs", "20"));
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "done-path", "flake")));
const RUN_TIMEOUT_MS = 6 * 60_000;
const script = path.resolve(option("--script", path.join(import.meta.dirname, "run.mjs")));

function oneRun(index) {
  const dir = path.join(outDir, `run-${String(index).padStart(2, "0")}`);
  const keep = args.includes("--keep");
  const flags = [...(index === 1 ? [] : ["--no-shots"]), ...(keep ? ["--keep"] : [])];
  const started = Date.now();
  const child = spawnSync(process.execPath, [script, "--out", dir, ...flags], { encoding: "utf8", timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const line = (child.stdout ?? "").split("\n").reverse().find((l) => l.startsWith("{"));
  let result = null;
  try { result = line ? JSON.parse(line) : null; } catch { result = null; }
  const seconds = Math.round((Date.now() - started) / 1000);
  // A passing run has nothing to investigate; only failures keep their sandbox.
  if (keep && result?.pass && result.sandbox && fs.existsSync(result.sandbox)) fs.rmSync(result.sandbox, { recursive: true, force: true });
  if (!result) return { index, seconds, crash: `no result (exit ${child.status}, signal ${child.signal}): ${(child.stderr ?? "").trim().split("\n").slice(-2).join(" ").slice(0, 300)}` };
  return { index, seconds, ...result };
}

function summarize(results) {
  const ids = [...new Set(results.flatMap((r) => (r.steps ?? []).map((s) => s.id)))];
  const rows = ids.map((id) => {
    const seen = results.flatMap((r) => (r.steps ?? []).filter((s) => s.id === id));
    const passed = seen.filter((s) => s.status === "PASS").length;
    const failures = seen.filter((s) => s.status !== "PASS").map((s) => s.error);
    return { id, title: seen[0]?.title, passed, of: results.length, failures };
  });
  const probeIds = [...new Set(results.flatMap((r) => (r.probes ?? []).map((p) => p.id)))];
  const probes = probeIds.map((id) => {
    const seen = results.flatMap((r) => (r.probes ?? []).filter((p) => p.id === id));
    return { id, title: seen[0]?.title, passed: seen.filter((p) => p.status === "PASS").length, of: seen.length };
  });
  const fullPasses = results.filter((r) => r.pass).length;
  return { runs: results.length, fullPasses, crashes: results.filter((r) => r.crash).length, rows, probes };
}

function markdown(summary, results) {
  const lines = [`# Done-path flake measurement`, "", `Runs: ${summary.runs}. Runs where every step passed: ${summary.fullPasses}/${summary.runs}. Crashed runs: ${summary.crashes}.`, "", "| step | passed | what |", "|---|---|---|"];
  for (const r of summary.rows) lines.push(`| ${r.id} | ${r.passed}/${r.of} | ${r.title} |`);
  lines.push("", "Probes (recorded, never gate the verdict):", "", "| probe | passed | what |", "|---|---|---|");
  for (const p of summary.probes) lines.push(`| ${p.id} | ${p.passed}/${p.of} | ${p.title} |`);
  lines.push("", "Failure messages:", "");
  for (const r of summary.rows) for (const f of new Set(r.failures)) lines.push(`- ${r.id}: ${f}`);
  for (const r of results.filter((x) => x.crash)) lines.push(`- run ${r.index}: ${r.crash}`);
  for (const r of results.filter((x) => !x.pass && x.sandbox && x.sandbox !== "(removed)")) lines.push(`- run ${r.index} sandbox kept: ${r.sandbox}`);
  lines.push("", `Seconds per run: ${results.map((r) => r.seconds).join(", ")}`);
  return `${lines.join("\n")}\n`;
}

fs.mkdirSync(outDir, { recursive: true });
const results = [];
for (let index = 1; index <= runs; index += 1) {
  const result = oneRun(index);
  results.push(result);
  console.log(`run ${index}/${runs}: ${result.crash ? `CRASH ${result.crash}` : result.pass ? "all PASS" : `FAIL ${result.steps.filter((s) => s.status !== "PASS").map((s) => s.id).join(",")}`} (${result.seconds}s)`);
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify({ summary: summarize(results), results }, null, 2)}\n`);
}
fs.writeFileSync(path.join(outDir, "summary.md"), markdown(summarize(results), results));
console.log(markdown(summarize(results), results));
