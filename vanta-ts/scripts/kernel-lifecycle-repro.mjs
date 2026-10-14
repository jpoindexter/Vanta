#!/usr/bin/env node
// Launches the real `vanta desktop` runtime with an isolated HOME and a unique
// kernel port, ends it by each exit path, and counts surviving processes.
// Only pids this script started (and their descendants / its unique ports) are
// ever inspected or signalled.
//
//   node scripts/kernel-lifecycle-repro.mjs [--ephemeral=0|1|default] [--watch=0] [--only=SIGTERM,SIGKILL,SIGINT,SIGHUP,parent-death]
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kernelBin = process.env.VANTA_KERNEL_BIN ?? resolve(tsRoot, "..", "target", "debug", "vanta-kernel");
const loader = pathToFileURL(join(tsRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const EXIT_PATHS = (args.only ?? "SIGTERM,SIGINT,SIGHUP,SIGKILL,parent-death").split(",");
const SETTLE_MS = 6000;

async function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
    s.on("error", fail);
  });
}

function psTable() {
  const out = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null;
  }).filter(Boolean);
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

function listenerPid(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim();
    return out ? Number(out.split("\n")[0]) : null;
  } catch { return null; }
}

/** Every process in the table that is one of ours: descendants of root pids or carrying a unique port in argv. */
function ours(rootPids, ports) {
  const table = psTable();
  const set = new Set(rootPids);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of table) if (set.has(p.ppid) && !set.has(p.pid)) { set.add(p.pid); grew = true; }
  }
  return table.filter((p) => set.has(p.pid) || ports.some((port) => new RegExp(`(serve|desktop) ${port}\\b`).test(p.command)));
}

async function waitFor(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await check(); if (v) return v; await sleep(150); }
  return null;
}

function runtimeEnv(home, ports, ephemeral) {
  const env = {
    ...process.env, HOME: home, VANTA_HOME: join(home, ".vanta"),
    VANTA_DESKTOP_BOUNDARY_TOKEN: "repro-boundary-token", VANTA_KERNEL_BIN: kernelBin,
    VANTA_KERNEL_URL: `http://127.0.0.1:${ports.kernel}`,
  };
  delete env.VANTA_KERNEL_EPHEMERAL;
  delete env.VANTA_DESKTOP_PARENT_WATCH;
  if (ephemeral === "0" || ephemeral === "1") env.VANTA_KERNEL_EPHEMERAL = ephemeral;
  // Both desktop shells set this so the runtime ends when the shell does.
  if (args.watch !== "0") env.VANTA_DESKTOP_PARENT_WATCH = "1";
  return env;
}

function runtimeArgv(port) { return ["--import", loader, join(tsRoot, "src", "cli.ts"), "desktop", String(port), "--no-open"]; }

// parent-death: a throwaway Node parent spawns the runtime, then gets SIGKILLed.
const PARENT_SRC = `
const { spawn } = require("node:child_process");
const c = spawn(process.execPath, JSON.parse(process.env.REPRO_ARGV), { stdio: ["ignore","ignore","ignore"], env: process.env });
console.log(c.pid); setInterval(()=>{}, 1000);`;

async function scenario(path, ephemeral) {
  const home = mkdtempSync(join(tmpdir(), "vanta-kl-"));
  mkdirSync(join(home, ".vanta"), { recursive: true });
  const ports = { runtime: await freePort(), kernel: await freePort() };
  const env = runtimeEnv(home, ports, ephemeral);
  const argv = runtimeArgv(ports.runtime);
  let supervisor; let runtimePid;
  if (path === "parent-death") {
    supervisor = spawn(process.execPath, ["-e", PARENT_SRC], { cwd: tsRoot, env: { ...env, REPRO_ARGV: JSON.stringify(argv) }, stdio: ["ignore", "pipe", "ignore"] });
    runtimePid = Number(await new Promise((ok) => supervisor.stdout.once("data", (d) => ok(String(d).trim()))));
  } else {
    supervisor = spawn(process.execPath, argv, { cwd: tsRoot, env, stdio: ["ignore", "ignore", "ignore"] });
    runtimePid = supervisor.pid;
  }
  const kernelPid = await waitFor(() => listenerPid(ports.kernel), 25_000);
  const before = ours([supervisor.pid, runtimePid], [ports.runtime, ports.kernel]);
  if (!kernelPid) { cleanup(); return { path, ephemeral, error: "kernel never started", before: before.length }; }

  if (path === "parent-death") process.kill(supervisor.pid, "SIGKILL");
  else process.kill(runtimePid, path);
  await sleep(SETTLE_MS);

  const survivors = ours([supervisor.pid, runtimePid, kernelPid], [ports.runtime, ports.kernel]).filter((p) => alive(p.pid));
  const result = {
    path, ephemeral, before: before.length,
    runtimeAlive: alive(runtimePid), kernelAlive: alive(kernelPid), survivors: survivors.length,
    detail: survivors.map((p) => `${p.pid}(ppid ${p.ppid}) ${p.command.slice(0, 70)}`),
  };
  cleanup();
  return result;

  function cleanup() {
    for (const p of ours([supervisor.pid, runtimePid, kernelPid ?? -1], [ports.runtime, ports.kernel])) {
      try { process.kill(p.pid, "SIGKILL"); } catch { /* already gone */ }
    }
    rmSync(home, { recursive: true, force: true });
  }
}

const rows = [];
for (const ephemeral of (args.ephemeral ? [args.ephemeral] : ["default", "0", "1"])) {
  for (const path of EXIT_PATHS) rows.push(await scenario(path, ephemeral));
}
console.log("| exit path | VANTA_KERNEL_EPHEMERAL | procs before | runtime alive | kernel alive | survivors |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.path} | ${r.ephemeral} | ${r.before} | ${r.runtimeAlive} | ${r.kernelAlive} | ${r.error ?? r.survivors} |`);
}
for (const r of rows) for (const d of r.detail ?? []) console.log(`  ${r.path}/${r.ephemeral}: ${d}`);
