#!/usr/bin/env node
// Per-stage timeline of the desktop runtime child: spawn -> first output ->
// listening -> /api/status reachable -> kernel online, with CPU and RSS.
// Always runs against an isolated VANTA_HOME so it never touches real data.
//   node scripts/desktop-launch-timeline.mjs [--runs N] [--json] -- <exe> <args...>
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";

const LISTEN_MARKER = "vanta desktop —";
const POLL_MS = 25;
const KERNEL_TIMEOUT_MS = 60_000;
const TOKEN = "timeline-token";

export function parseArgs(argv) {
  const sep = argv.indexOf("--");
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  const runsIdx = own.indexOf("--runs");
  return { runs: runsIdx >= 0 ? Number(own[runsIdx + 1]) : 1, json: own.includes("--json"), command };
}

/** ps prints cputime as [[H:]M:]SS.cc; returns seconds. */
export function parseCpuTime(text) {
  const parts = text.trim().split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function psValue(pid, field) {
  try {
    return execFileSync("ps", ["-o", `${field}=`, "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function fetchStatus(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { "x-vanta-desktop-boundary": TOKEN } });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

async function waitKernel(port, startedAt) {
  while (performance.now() - startedAt < KERNEL_TIMEOUT_MS) {
    const status = await fetchStatus(port);
    if (status?.kernel === "online") return performance.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return undefined;
}

/** CPU seconds for the process and its descendants, split by role. */
export function treeCpu(pid) {
  let table = "";
  try {
    table = execFileSync("ps", ["-axo", "pid=,ppid=,cputime=,comm="], { encoding: "utf8" });
  } catch {
    return undefined;
  }
  const rows = table.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cpu: parseCpuTime(m[3]), comm: m[4] }));
  const out = { self: 0, esbuild: 0, kernel: 0, other: 0 };
  const walk = (parent, depth) => {
    for (const row of rows.filter((r) => r.ppid === parent)) {
      const key = row.comm.includes("esbuild") ? "esbuild" : row.comm.includes("vanta-kernel") ? "kernel" : "other";
      out[key] += row.cpu;
      if (depth < 4) walk(row.pid, depth + 1);
    }
  };
  const self = rows.find((r) => r.pid === pid);
  out.self = self?.cpu ?? 0;
  walk(pid, 0);
  return out;
}

const cpuSeconds = (pid) => treeCpu(pid);

async function measureOnce(command) {
  const home = mkdtempSync(join(tmpdir(), "vanta-timeline-"));
  const port = await freePort();
  const kernelPort = await freePort();
  const args = command.slice(1).map((arg) => (arg === "{port}" ? String(port) : arg));
  // A placeholder key lets prepareRun build a provider without any network call.
  const env = { OPENAI_API_KEY: "sk-timeline-placeholder", ...process.env, VANTA_HOME: home, VANTA_DESKTOP_BOUNDARY_TOKEN: TOKEN, VANTA_PROJECT_ROOT: home, VANTA_LAUNCH_TRACE: "1",
    VANTA_KERNEL_URL: `http://127.0.0.1:${kernelPort}`, VANTA_KERNEL_EPHEMERAL: "1" };
  const startedAt = performance.now();
  const child = spawn(command[0], args, { env, cwd: home, stdio: ["ignore", "pipe", "pipe"] });
  const result = { load: loadavg()[0].toFixed(1), trace: [] };
  let output = "";
  const listening = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => {
      result.firstOutputMs ??= performance.now() - startedAt;
      output += chunk.toString();
      if (output.includes(LISTEN_MARKER) && result.listeningMs === undefined) {
        result.listeningMs = performance.now() - startedAt;
        result.cpuAtListening = cpuSeconds(child.pid);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.startsWith("[launch]")) result.trace.push(line);
        else if (line.trim()) result.stderrTail = line;
      }
    });
    child.once("exit", (code) => { result.exitCode = code; resolve(); });
  });
  await listening;
  if (result.listeningMs === undefined) throw new Error(`runtime exited (${result.exitCode}) before listening: ${result.stderrTail ?? "no stderr"}`);
  result.kernelOnlineMs = await waitKernel(port, startedAt);
  result.cpuAtKernel = cpuSeconds(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  result.rssIdleMb = Number(psValue(child.pid, "rss")) / 1024;
  result.cpuIdle = cpuSeconds(child.pid);
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  rmSync(home, { recursive: true, force: true });
  return result;
}

function median(values) {
  const sorted = values.filter((v) => v !== undefined).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
}

async function main() {
  const { runs, json, command } = parseArgs(process.argv.slice(2));
  if (command.length === 0) throw new Error("Usage: desktop-launch-timeline.mjs [--runs N] [--json] -- <exe> <args...> (use {port} for the port)");
  const results = [];
  for (let i = 0; i < runs; i += 1) results.push(await measureOnce(command));
  const summary = {
    runs, load: results.map((r) => r.load),
    listeningMs: median(results.map((r) => r.listeningMs)),
    kernelOnlineMs: median(results.map((r) => r.kernelOnlineMs)),
    cpuAtListening: results.map((r) => r.cpuAtListening),
    cpuAtKernel: results.map((r) => r.cpuAtKernel),
    rssIdleMb: median(results.map((r) => r.rssIdleMb)),
    trace: results.at(-1)?.trace ?? [],
  };
  if (json) console.log(JSON.stringify({ summary, results }, null, 2));
  else console.log(summary);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
