import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron as electron } from "playwright-core";
import { evaluatePerformanceBudgets, performanceFailureMessage } from "./lib/desktop-performance-budget.mjs";

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
const home = await mkdtemp(join(tmpdir(), "vanta-performance-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-performance-profile-"));
const projectContainer = await mkdtemp(join(tmpdir(), "vanta-performance-project-"));
const project = join(projectContainer, "performance-proof-project");
let app;

try {
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "README.md"), "# Performance proof\n", "utf8");
  const coldStartAt = performance.now();
  app = await electron.launch({
    executablePath,
    args: ["--project", project],
    cwd: root,
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7845",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-performance-proof-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  const coldStartMs = performance.now() - coldStartAt;
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
  const metrics = {
    coldStartMs: round(coldStartMs),
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
  if (update) {
    for (const [name, value] of Object.entries(metrics)) config.budgets[name].baseline = value;
    await writeFile(budgetPath, `${JSON.stringify(allBudgets, null, 2)}\n`, "utf8");
  }
  const result = evaluatePerformanceBudgets(metrics, config);
  if (!result.passed) throw new Error(`Desktop performance budget failed:\n${performanceFailureMessage(result)}`);
  process.stdout.write(`${JSON.stringify({ target, metrics, budgets: result.results })}\n`);
} finally {
  if (app) await app.close().catch(() => undefined);
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(userData, { recursive: true, force: true }),
    rm(projectContainer, { recursive: true, force: true }),
  ]);
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
