import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { median } from "./lib/desktop-performance-budget.mjs";

// Reconstruct the baseline separately from a named Git revision. This driver
// never builds, installs, changes a budget, or writes into either app bundle.
assert(process.env.VANTA_BASELINE_APP, "VANTA_BASELINE_APP must name the reconstructed original .app");
const apps = {
  baseline: resolve(process.env.VANTA_BASELINE_APP),
  candidate: resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app"),
};
assert.notEqual(apps.baseline, apps.candidate);
for (const app of Object.values(apps)) assert(app.endsWith(".app"));
const output = resolve(process.env.VANTA_COMPARISON_OUTPUT ?? ".artifacts/chat-first-proof/comparison");
await mkdir(output, { recursive: true });
const hash = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const hashes = Object.fromEntries(await Promise.all(Object.entries(apps).map(async ([label, app]) =>
  [label, await hash(join(app, "Contents/Resources/app.asar"))])));
const observations = { baseline: { long: [], resource: [] }, candidate: { long: [], resource: [] } };
const commands = [];
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), LANG: "en_US.UTF-8" };

try {
  for (let round = 0; round < 5; round++) {
    for (const label of round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const name = `${label}-long-${round + 1}`;
      const result = await run(name, "scripts/desktop-long-session-navigation-smoke.mjs", {
        VANTA_DESKTOP_APP: join(apps[label], "Contents/MacOS/Vanta"), VANTA_MEASURE_STOP: "1",
      });
      observations[label].long.push(result.observedLatencyMs);
      console.log(`${name}: ${JSON.stringify(result.observedLatencyMs)}`);
    }
  }
  for (let round = 0; round < 3; round++) {
    for (const label of round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const name = `${label}-resource-${round + 1}`;
      const result = await run(name, "scripts/desktop-performance-budget.mjs", { VANTA_DESKTOP_APP: apps[label] });
      observations[label].resource.push(result.metrics);
      console.log(`${name}: ${JSON.stringify(result.metrics)}`);
    }
  }
  const comparison = [
    ...compare("long", ["typing", "scrollAndPersist", "shortSwitch", "longReturn", "stop"]),
    ...compare("resource", ["coldStartMs", "firstUseMs", "idleMemoryMb", "activeCpuPercent", "appAsarBytes", "unpackedResourceBytes", "installedSizeBytes"]),
  ];
  const receipt = { verdict: comparison.every((row) => row.verdict === "within-threshold") ? "passed" : "needs-review",
    baselineRevision: process.env.VANTA_BASELINE_REVISION ?? "not supplied", hashes,
    hardware: { platform: platform(), arch: arch(), release: release(), model: sysctl("hw.model"), cpu: sysctl("machdep.cpu.brand_string"), memoryBytes: Number(sysctl("hw.memsize")) },
    sampling: "Alternating paired order; 5 long-chat runs and 3 resource runs per package. Each resource run includes 3 cold starts. No concurrent build/test work.",
    thresholdPercent: 10, comparison, observations, commands,
    boundary: "Reconstructed baseline measured retrospectively on this host. Real isolated packages/runtime/stores; model output synthetic. Not live-account, screen-reader, owner-acceptance or broad statistical proof." };
  for (const [label, app] of Object.entries(apps)) assert.equal(await hash(join(app, "Contents/Resources/app.asar")), hashes[label]);
  await writeFile(join(output, "result.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: receipt.verdict, comparison }));
  if (receipt.verdict !== "passed") process.exitCode = 1;
} catch (error) {
  await writeFile(join(output, "failure.json"), JSON.stringify({ hashes, commands, observations, error: String(error) }, null, 2));
  throw error;
}

async function run(name, script, settings) {
  const result = spawnSync(process.execPath, [script], { env: { ...env, ...settings }, encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  commands.push({ name, command: [process.execPath, script], settings, exit: result.status, signal: result.signal });
  await writeFile(join(output, `${name}.json`), result.stdout ?? "");
  await writeFile(join(output, `${name}.stderr`), result.stderr ?? "");
  assert.equal(result.status, 0, `${name} failed; inspect ${name}.stderr`);
  return JSON.parse(result.stdout);
}

function compare(group, names) {
  return names.map((name) => {
    const before = observations.baseline[group].map((row) => row[name]);
    const after = observations.candidate[group].map((row) => row[name]);
    assert(before.every(Number.isFinite) && after.every(Number.isFinite), `${group}/${name} samples missing`);
    const baselineMedian = median(before), candidateMedian = median(after);
    const changePercent = (candidateMedian / baselineMedian - 1) * 100;
    const slowerPairs = after.filter((value, index) => value > before[index] * 1.1).length;
    return { name, group, baselineMedian, candidateMedian, changePercent, slowerPairs, pairs: before.length,
      verdict: changePercent <= 10 ? "within-threshold" : slowerPairs > before.length / 2 ? "regression" : "inconclusive" };
  });
}

function sysctl(key) {
  return execFileSync("/usr/sbin/sysctl", ["-n", key], { encoding: "utf8" }).trim();
}
