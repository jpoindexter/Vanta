#!/usr/bin/env node
// Proves what is left running after the source desktop app (desktop-app/electron/main.mjs) ends, per exit path.
// Each run gets its own HOME, VANTA_HOME, userData and free runtime/kernel ports, and the windows are hidden.
// A process "belongs to the run" only if it descends from the Electron pid this script launched, or its
// command line carries the run's temp dir or its unique kernel/runtime port. Nothing else is inspected or signalled.
//
//   node scripts/desktop-kernel-lifecycle-proof.mjs [--paths smoke,sigterm,sigkill] [--out file.json]
//   smoke   = `main.mjs --smoke`: boots, checks the kernel, then quits through app.quit() (the before-quit teardown)
//   sigterm = SIGTERM to Electron's main process, sigkill = SIGKILL (no JS runs; the runtime's parent watch and the guard must act)
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronBin = join(tsRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
const hiddenWindow = resolve(tsRoot, "..", "desktop-next", "tools", "hidden-window.cjs");
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const PATHS = option("--paths", "smoke,sigterm,sigkill").split(",");
const outFile = option("--out", "");
const SETTLE_MS = 15_000;
const BOOT_MS = 90_000;

const freePort = () => new Promise((ok, fail) => {
  const server = createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => ok(port)); });
});

function table() {
  const out = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").flatMap((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }] : [];
  });
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

function role(command) {
  if (command.includes("vanta-kernel-guard")) return "kernel-guard";
  if (/vanta-kernel serve \d+$/.test(command)) return "kernel";
  if (/ desktop \d+ /.test(command)) return "runtime";
  return command.includes("Helper") || command.includes("--type=") ? "electron-helper" : "electron-main";
}

/** The run's live processes: the launched pid's tree, plus anything carrying this run's temp dir or ports. */
function census(rootPid, needles) {
  const all = table();
  const mine = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const proc of all) if (mine.has(proc.ppid) && !mine.has(proc.pid)) { mine.add(proc.pid); grew = true; }
  }
  return all
    .filter((proc) => proc.pid !== process.pid && (mine.has(proc.pid) || needles.some((n) => proc.command.includes(n))))
    .filter((proc) => isAlive(proc.pid))
    .map((proc) => ({ pid: proc.pid, ppid: proc.ppid, role: role(proc.command) }));
}

const tally = (rows) => rows.reduce((acc, row) => ({ ...acc, [row.role]: (acc[row.role] ?? 0) + 1 }), {});

async function until(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await sleep(250); }
  return null;
}

function sandbox(ports) {
  const root = mkdtempSync(join(tmpdir(), "vanta-old-kl-"));
  const dirs = { home: join(root, "home"), vantaHome: join(root, "vanta-home"), userData: join(root, "user-data"), project: join(root, "project") };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && !/_(API_KEY|TOKEN|SECRET|PASSWORD|KEY)$/.test(key) && !key.startsWith("VANTA_") && key !== "NODE_OPTIONS") env[key] = value;
  }
  Object.assign(env, {
    HOME: dirs.home, VANTA_HOME: dirs.vantaHome, VANTA_DESKTOP_USER_DATA: dirs.userData, VANTA_PROJECT_ROOT: dirs.project,
    VANTA_DESKTOP_PORT: String(ports.runtime), VANTA_KERNEL_URL: `http://127.0.0.1:${ports.kernel}`,
    VANTA_SKIP_QUIT_CONFIRM: "1",
  });
  return { root, dirs, env };
}

async function runPath(how) {
  const ports = { runtime: await freePort(), kernel: await freePort() };
  const box = sandbox(ports);
  const needles = [box.root, ` serve ${ports.kernel}`, ` desktop ${ports.runtime} `];
  const runDir = join(box.dirs.vantaHome, "run");
  const listRunDir = () => { try { return readdirSync(runDir).filter((name) => /^kernel-\d+\.json$/.test(name)); } catch { return []; } };
  const electronArgs = ["--require", hiddenWindow, join(tsRoot, "desktop-app", "electron", "main.mjs"), ...(how === "smoke" ? ["--smoke"] : [])];
  const app = spawn(electronBin, electronArgs, { cwd: tsRoot, env: box.env, stdio: ["ignore", "ignore", "ignore"] });
  const exited = new Promise((ok) => app.once("exit", () => ok(true)));
  let running = [];
  let pidFilesWhileRunning = [];
  if (how === "smoke") {
    // The smoke run quits by itself, so poll until Electron's main process is gone and keep the peak seen per role.
    let done = false;
    exited.then(() => { done = true; });
    const peak = {};
    const seen = new Set();
    const deadline = Date.now() + BOOT_MS;
    while (!done && Date.now() < deadline) {
      const rows = census(app.pid, needles);
      for (const [name, count] of Object.entries(tally(rows))) peak[name] = Math.max(peak[name] ?? 0, count);
      for (const name of listRunDir()) seen.add(name);
      await sleep(100);
    }
    running = Object.entries(peak).flatMap(([name, count]) => Array.from({ length: count }, () => ({ role: name })));
    pidFilesWhileRunning = [...seen];
  } else {
    running = (await until(() => {
      const rows = census(app.pid, needles);
      return rows.some((r) => r.role === "runtime") && rows.some((r) => r.role === "kernel") ? rows : null;
    }, BOOT_MS)) ?? census(app.pid, needles);
    pidFilesWhileRunning = listRunDir();
    process.kill(app.pid, how === "sigterm" ? "SIGTERM" : "SIGKILL");
  }
  const started = Date.now();
  let after = census(app.pid, needles);
  while (after.length > 0 && Date.now() - started < SETTLE_MS) { await sleep(250); after = census(app.pid, needles); }
  const pidFilesAfter = listRunDir();
  const result = {
    exitPath: how, running: tally(running), runningTotal: running.length, pidFilesWhileRunning, pidFilesAfter,
    afterSeconds: Number(((Date.now() - started) / 1000).toFixed(1)), after: tally(after), afterTotal: after.length,
  };
  for (const proc of after) { try { process.kill(proc.pid, "SIGKILL"); } catch { /* already gone */ } }
  rmSync(box.root, { recursive: true, force: true });
  return result;
}

const results = [];
for (const how of PATHS) {
  const result = await runPath(how);
  results.push(result);
  console.log(JSON.stringify(result));
}
if (outFile) writeFileSync(outFile, `${JSON.stringify({ app: "vanta-ts/desktop-app/electron/main.mjs", results }, null, 2)}\n`);
