import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron as electron } from "playwright-core";
import { evaluatePerformanceBudgets, evaluateSampleHardMax, median, performanceFailureMessage } from "./lib/desktop-performance-budget.mjs";

const run = promisify(execFile);
const root = process.cwd();
const target = `${platform()}-${arch()}`;
const budgetPath = resolve("scripts", "fixtures", "desktop-performance-budgets.json");
const appBundlePath = resolve(process.env.VANTA_DESKTOP_APP ?? `release/mac-${arch() === "arm64" ? "arm64" : "x64"}/Vanta.app`);
const executablePath = appBundlePath.endsWith(".app") ? join(appBundlePath, "Contents", "MacOS", "Vanta") : appBundlePath;
const bundleRoot = appBundlePath.endsWith(".app") ? appBundlePath : resolve(executablePath, "..", "..", "..");
const asarPath = join(bundleRoot, "Contents", "Resources", "app.asar");
const unpackedPath = join(bundleRoot, "Contents", "Resources", "app.asar.unpacked");
const update = process.argv.includes("--update");
const basePort = Number(process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7845");
const home = await mkdtemp(join(tmpdir(), "vanta-performance-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-performance-profile-"));
const projectContainer = await mkdtemp(join(tmpdir(), "vanta-performance-project-"));
const project = join(projectContainer, "performance-proof-project");
const scratchPaths = [home, userData, projectContainer];
let app;

try {
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "README.md"), "# Performance proof\n", "utf8");
  const primary = await launchMeasuredApp({ home, userData, project, port: basePort });
  app = primary.app;
  const page = primary.page;
  page.setDefaultTimeout(30_000);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
  const idle = await processTreeMetrics(app.process().pid);

  let releaseResponse;
  await page.route(/\/api\/chat$/, (route) => new Promise((resolveRoute) => {
    releaseResponse = () => void route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ finalText: "Performance proof completed.", events: [{ label: "Proof completed", ok: true }] }),
    }).then(resolveRoute);
  }));
  await page.locator("#vanta-composer").fill("run the performance proof");
  const firstUseAt = performance.now();
  await page.locator("#vanta-composer").press("Enter");
  await page.getByRole("button", { name: "Stop current run" }).waitFor();
  const activeSamples = [];
  for (let index = 0; index < 3; index += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    activeSamples.push(await processTreeMetrics(app.process().pid));
  }
  releaseResponse?.();
  await page.getByText("Performance proof completed.").waitFor();
  const firstUseMs = performance.now() - firstUseAt;
  await app.close();
  app = undefined;

  const coldStartSamplesMs = [primary.coldStartMs];
  for (let sample = 2; sample <= 3; sample += 1) {
    const sampleHome = await mkdtemp(join(tmpdir(), `vanta-performance-home-${sample}-`));
    const sampleUserData = await mkdtemp(join(tmpdir(), `vanta-performance-profile-${sample}-`));
    const sampleProjectContainer = await mkdtemp(join(tmpdir(), `vanta-performance-project-${sample}-`));
    const sampleProject = join(sampleProjectContainer, "performance-proof-project");
    scratchPaths.push(sampleHome, sampleUserData, sampleProjectContainer);
    await mkdir(sampleProject, { recursive: true });
    await writeFile(join(sampleProject, "README.md"), "# Performance proof\n", "utf8");
    const measured = await launchMeasuredApp({ home: sampleHome, userData: sampleUserData, project: sampleProject, port: basePort + sample - 1 });
    coldStartSamplesMs.push(measured.coldStartMs);
    await measured.app.close();
  }

  const metrics = {
    coldStartMs: round(median(coldStartSamplesMs)),
    firstUseMs: round(firstUseMs),
    idleMemoryMb: round(idle.rssKb / 1024),
    activeCpuPercent: round(Math.max(...activeSamples.map((sample) => sample.cpuPercent))),
    appAsarBytes: (await stat(asarPath)).size,
    unpackedResourceBytes: await directorySize(unpackedPath),
    installedSizeBytes: await directoryAllocatedSize(bundleRoot),
  };
  const allBudgets = JSON.parse(await readFile(budgetPath, "utf8"));
  const config = allBudgets.targets[target];
  if (!config) throw new Error(`No desktop performance budget for ${target}`);
  const coldStartHardMax = config.budgets.coldStartMs.max;
  const sampleResult = evaluateSampleHardMax(coldStartSamplesMs, coldStartHardMax);
  if (!sampleResult.passed) {
    throw new Error(`Desktop performance budget failed:\ncoldStartMs sample ${round(sampleResult.worst)} exceeded hard max ${coldStartHardMax}; samples ${coldStartSamplesMs.map(round).join(", ")}`);
  }
  if (update) {
    for (const [name, value] of Object.entries(metrics)) config.budgets[name].baseline = value;
    await writeFile(budgetPath, `${JSON.stringify(allBudgets, null, 2)}\n`, "utf8");
  }
  const result = evaluatePerformanceBudgets(metrics, config);
  if (!result.passed) throw new Error(`Desktop performance budget failed:\n${performanceFailureMessage(result)}`);
  process.stdout.write(`${JSON.stringify({ target, metrics, evidence: { coldStartSamplesMs: coldStartSamplesMs.map(round), coldStartWorstMs: round(sampleResult.worst) }, budgets: result.results })}\n`);
} finally {
  if (app) await app.close().catch(() => undefined);
  await Promise.all(scratchPaths.map((path) => rm(path, { recursive: true, force: true })));
}

async function launchMeasuredApp(paths) {
  const coldStartAt = performance.now();
  const launchedApp = await electron.launch({
    executablePath,
    args: ["--project", paths.project],
    cwd: root,
    env: {
      ...process.env,
      VANTA_HOME: paths.home,
      VANTA_DESKTOP_USER_DATA: paths.userData,
      VANTA_DESKTOP_PORT: String(paths.port),
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-performance-proof-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await launchedApp.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  return { app: launchedApp, page, coldStartMs: performance.now() - coldStartAt };
}

async function processTreeMetrics(rootPid) {
  const { stdout } = await run("ps", ["-axo", "pid=,ppid=,rss=,%cpu="]);
  const rows = stdout.trim().split("\n").map((line) => {
    const [pid, ppid, rss, cpu] = line.trim().split(/\s+/).map(Number);
    return { pid, ppid, rss, cpu };
  }).filter((row) => row.pid);
  const pids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (pids.has(row.ppid) && !pids.has(row.pid)) { pids.add(row.pid); changed = true; }
  }
  return rows.filter((row) => pids.has(row.pid)).reduce((sum, row) => ({ rssKb: sum.rssKb + row.rss, cpuPercent: sum.cpuPercent + row.cpu }), { rssKb: 0, cpuPercent: 0 });
}

async function directorySize(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => directorySize(join(path, entry.name))));
  return sizes.reduce((total, size) => total + size, 0);
}

async function directoryAllocatedSize(path, seen = new Set()) {
  const info = await stat(path);
  const key = `${info.dev}:${info.ino}`;
  if (seen.has(key)) return 0;
  seen.add(key);
  if (!info.isDirectory()) return typeof info.blocks === "number" ? info.blocks * 512 : info.size;
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = [];
  for (const entry of entries) sizes.push(await directoryAllocatedSize(join(path, entry.name), seen));
  return sizes.reduce((total, size) => total + size, 0);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
