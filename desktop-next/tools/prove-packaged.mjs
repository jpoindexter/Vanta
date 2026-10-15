// Boots the built "Vanta.app" in a sandbox and proves the real path: window, real Vanta server, kernel online,
// one chat turn answered by the canned local model, screenshots, timings. Everything it starts is killed on exit.
//   node tools/prove-packaged.mjs [--app <path>] [--runs 2] [--out docs/proofs/packaging]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { startMockOpenAI } from "./mock-openai.mjs";
import { descendants, killAll, loadAverage, stragglers } from "./packaging/proc-tree.mjs";
import { createSandbox } from "./packaging/sandbox.mjs";

const require = createRequire(import.meta.url);
const next = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const appPath = path.resolve(option("--app", path.join(next, "apps", "desktop", "release", "mac-arm64", "Vanta.app")));
const outDir = path.resolve(option("--out", path.join(next, "docs", "proofs", "packaging")));
const runs = Number(option("--runs", "2"));
const binary = path.join(appPath, "Contents", "MacOS", "Vanta");
const hiddenWindow = path.join(import.meta.dirname, "hidden-window.cjs");
const REPLY = "Hello from the proof model";
const ms = (start) => Math.round(performance.now() - start);

async function pollStatus(page, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const status = await page.evaluate(() => window.hermesDesktop.api({ path: "/api/status" }).catch((error) => ({ error: String(error) })));
    if (status?.kernel) return status;
    if (performance.now() > deadline) throw new Error(`/api/status never answered: ${JSON.stringify(status)}`);
    await page.waitForTimeout(250);
  }
}

async function drive({ app, page, index, t0, facts }) {
  await page.locator("[data-vanta-titlebar]").first().waitFor({ state: "visible", timeout: 90_000 });
  facts.windowVisibleMs = ms(t0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  const composer = page.getByTestId("home-composer-input");
  await composer.waitFor({ state: "visible", timeout: 90_000 });
  facts.composerReadyMs = ms(t0);
  facts.status = await pollStatus(page, 90_000);
  facts.statusMs = ms(t0);
  facts.app = await app.evaluate(({ app: electronApp }) => ({
    isPackaged: electronApp.isPackaged, name: electronApp.getName(), version: electronApp.getVersion(),
    userData: electronApp.getPath("userData"), resources: process.resourcesPath,
  }));
  fs.mkdirSync(outDir, { recursive: true });
  if (index === 1) await page.screenshot({ path: path.join(outDir, "packaged-home.png") });
  await composer.fill("Say hello");
  await composer.press("Enter");
  const chatStart = performance.now();
  await page.getByText(REPLY, { exact: false }).first().waitFor({ timeout: 90_000 });
  facts.chatReplyMs = ms(chatStart);
  await page.waitForTimeout(800);
  if (index === 1) await page.screenshot({ path: path.join(outDir, "packaged-chat.png") });
}

function measureTree({ app, box, facts, t0, errors }) {
  const tree = descendants(app.process().pid);
  facts.processes = tree.map(({ pid, command, cpu, rssMb }) => ({ pid, cpu, rssMb, command: command.replaceAll(appPath, "<app>").replaceAll(box.root, "<sandbox>").slice(0, 220) }));
  facts.cpuSecondsTotal = Math.round(tree.reduce((sum, proc) => sum + proc.cpu, 0) * 10) / 10;
  facts.wallMs = ms(t0);
  facts.rendererErrors = errors;
  facts.load.after = loadAverage();
  facts.userDataInSandbox = fs.realpathSync(facts.app.userData).startsWith(fs.realpathSync(box.root));
}

async function runOnce(index) {
  const { _electron } = require("playwright-core");
  const mock = await startMockOpenAI();
  const box = createSandbox({ modelUrl: mock.url, hiddenWindow });
  const facts = { run: index, load: { before: loadAverage() } };
  let app;
  const t0 = performance.now();
  try {
    app = await _electron.launch({ executablePath: binary, args: [`--user-data-dir=${box.userData}`, "--disable-gpu", "--no-sandbox"], env: box.env });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
    await drive({ app, page, index, t0, facts });
    measureTree({ app, box, facts, t0, errors });
  } finally {
    await app?.close().catch(() => undefined);
    await mock.close();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const left = stragglers([box.root, appPath]);
    killAll(left);
    facts.leftRunningAfterClose = left.length;
    box.cleanup();
  }
  return facts;
}

if (!fs.existsSync(binary)) throw new Error(`No app at ${appPath}. Run: npm run vanta:package`);
const results = [];
for (let index = 1; index <= runs; index += 1) {
  const facts = await runOnce(index);
  results.push(facts);
  console.log(JSON.stringify({ run: index, windowVisibleMs: facts.windowVisibleMs, composerReadyMs: facts.composerReadyMs, statusMs: facts.statusMs, chatReplyMs: facts.chatReplyMs, kernel: facts.status.kernel, left: facts.leftRunningAfterClose }));
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "boot-timings.json"), `${JSON.stringify({ app: appPath, results }, null, 2)}\n`);
console.log(`wrote ${path.join(outDir, "boot-timings.json")}`);
