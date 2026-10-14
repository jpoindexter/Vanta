// Proves what is left running after the packaged app ends, by each exit path. Launches the app in a sandbox
// (own HOME, VANTA_HOME, user data; hidden windows), waits for its runtime and kernel, counts every process
// that belongs to the run, ends the app, and counts again. A process "belongs to the run" only if it is a
// descendant of the pid this script launched, or its command line contains this run's unique sandbox dir or
// the app path passed with --app. Nothing else is ever inspected, counted or signalled.
//   node tools/prove-kernel-lifecycle.mjs --app <Vanta Next.app> [--paths quit,sigterm,sigkill] [--out file.json]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { startMockOpenAI } from "./mock-openai.mjs";
import { descendants, killAll, stragglers } from "./packaging/proc-tree.mjs";
import { createSandbox } from "./packaging/sandbox.mjs";

const require = createRequire(import.meta.url);
const next = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const appPath = path.resolve(option("--app", path.join(next, "apps", "desktop", "release", "mac-arm64", "Vanta Next.app")));
const paths = option("--paths", "quit,sigterm,sigkill").split(",");
const outFile = option("--out", "");
const binary = path.join(appPath, "Contents", "MacOS", "Vanta Next");
const hiddenWindow = path.join(import.meta.dirname, "hidden-window.cjs");
const SETTLE_MS = 12_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function role(command) {
  if (command.includes("vanta-kernel-guard")) return "kernel-guard";
  if (/vanta-kernel serve \d+$/.test(command)) return "kernel";
  if (command.includes("dist-runtime/cli.mjs") && command.includes(" desktop ")) return "runtime";
  if (command.includes("Helper") || command.includes("--type=")) return "electron-helper";
  return "electron-main";
}

/** The run's processes: the launched pid's tree plus anything carrying this run's sandbox dir or app path. */
function census(mainPid, box) {
  const byPid = new Map();
  for (const proc of descendants(mainPid)) if (proc.pid !== mainPid || isAlive(mainPid)) byPid.set(proc.pid, proc);
  for (const proc of stragglers([box.root, appPath])) byPid.set(proc.pid, proc);
  return [...byPid.values()].filter((proc) => isAlive(proc.pid)).map((proc) => ({ pid: proc.pid, ppid: proc.ppid, role: role(proc.command) }));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const tally = (rows) => rows.reduce((acc, row) => ({ ...acc, [row.role]: (acc[row.role] ?? 0) + 1 }), {});

async function waitForKernelFile(box, timeoutMs) {
  const dir = path.join(box.env.VANTA_HOME, "run");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => /^kernel-\d+\.json$/.test(name)) : undefined;
    if (file) return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    await sleep(250);
  }
  return undefined;
}

async function waitForListening(mainPid, box, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = census(mainPid, box);
    if (rows.some((row) => row.role === "runtime") && rows.some((row) => row.role === "kernel")) return rows;
    await sleep(500);
  }
  return census(mainPid, box);
}

async function endApp(app, how) {
  const pid = app.process().pid;
  if (how === "quit") await app.close();
  else process.kill(pid, how === "sigterm" ? "SIGTERM" : "SIGKILL");
}

async function runPath(how) {
  const { _electron } = require("playwright-core");
  const mock = await startMockOpenAI();
  const box = createSandbox({ modelUrl: mock.url, hiddenWindow });
  const app = await _electron.launch({ executablePath: binary, args: [`--user-data-dir=${box.userData}`, "--disable-gpu", "--no-sandbox"], env: box.env });
  const mainPid = app.process().pid;
  await app.firstWindow();
  const running = await waitForListening(mainPid, box, 90_000);
  const kernelFile = await waitForKernelFile(box, 5000);
  const runDir = path.join(box.env.VANTA_HOME, "run");
  const listRunDir = () => (fs.existsSync(runDir) ? fs.readdirSync(runDir) : []);
  const pidFilesWhileRunning = listRunDir();
  const started = Date.now();
  await endApp(app, how).catch(() => undefined);
  let after = census(mainPid, box);
  while (after.length > 0 && Date.now() - started < SETTLE_MS) {
    await sleep(250);
    after = census(mainPid, box);
  }
  const pidFilesAfter = listRunDir();
  const result = {
    exitPath: how, appPath: appPath.replace(process.env.HOME ?? "", "~"), running: tally(running), runningTotal: running.length,
    pidFileWritten: Boolean(kernelFile), pidFilesWhileRunning, pidFilesAfter, pidFileGoneAfter: pidFilesAfter.length === 0, afterSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    after: tally(after), afterTotal: after.length,
  };
  killAll(after);
  await app.close().catch(() => undefined);
  await mock.close();
  box.cleanup();
  return result;
}

if (!fs.existsSync(binary)) throw new Error(`No app at ${appPath}. Run: npm run vanta:package`);
const results = [];
for (const how of paths) {
  const result = await runPath(how);
  results.push(result);
  console.log(JSON.stringify(result));
}
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify({ app: appPath, results }, null, 2)}\n`);
