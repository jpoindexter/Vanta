// Runtime outbound-network audit (DN-11).
//
//   node tools/network-audit.mjs [--out <file.json>] [--idle <seconds>]
//
// Launches the built renderer in Electron (same sandbox as launch-mock.mjs) with
// Chromium's net log enabled, runs one chat turn, idles, then reads every
// URL_REQUEST the process tree started (renderer and main share the network
// service, so main-process `net`/`fetch` calls are included) and groups them by
// host. Anything that is not localhost/127.0.0.1 is reported as EXTERNAL and
// makes the script exit non-zero.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = import.meta.dirname;
const desktopRoot = path.resolve(here, "..", "apps", "desktop");
const hermesRepo = process.env.HERMES_REPO ?? path.join(os.homedir(), ".hermes", "hermes-agent");
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outFile = path.resolve(flag("--out", "network-audit.json"));
const idleSeconds = Number(flag("--idle", "20"));

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const importHermes = (rel) => import(pathToFileURL(path.join(hermesRepo, "tests-js", "scripts", rel)).href);
const { startMockServer } = await importHermes("mock-server.ts");
const { writeMockProviderConfig, writeEnvFile } = await importHermes("mock-provider-config.ts");

const electronBin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
for (const f of [electronBin, path.join(desktopRoot, "dist", "electron-main.mjs"), path.join(desktopRoot, "dist", "index.html")]) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Build apps/desktop first.`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-net-audit-"));
const hermesHome = path.join(root, "hermes-home");
const userData = path.join(root, "electron-user-data");
const netLog = path.join(root, "netlog.json");
fs.mkdirSync(hermesHome, { recursive: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify({ x: 0, y: 0, width: 1440, height: 900, isMaximized: false }));
const mock = await startMockServer();
writeMockProviderConfig(hermesHome, mock.url);
writeEnvFile(hermesHome);

const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY)$/;
const env = {};
for (const [k, v] of Object.entries(process.env)) {
  if (!v || SECRET.test(k) || (k.startsWith("HERMES_") && !k.startsWith("HERMES_DESKTOP_"))) continue;
  env[k] = v;
}
Object.assign(env, {
  HERMES_HOME: hermesHome, HERMES_DESKTOP_USER_DATA_DIR: userData, HERMES_DESKTOP_IGNORE_EXISTING: "1",
  HERMES_DESKTOP_ISOLATED_BACKEND: "1", HOME: root, HERMES_DESKTOP_HERMES_ROOT: hermesRepo,
  HERMES_DESKTOP_APP_NAME: `VantaNetAudit-${Date.now()}`, HERMES_DESKTOP_SKIP_QUIT_CONFIRM: "1",
});

const app = await _electron.launch({
  executablePath: electronBin,
  args: [desktopRoot, "--disable-gpu", "--no-sandbox", `--log-net-log=${netLog}`, "--net-log-capture-mode=Default"],
  env, cwd: desktopRoot,
});
const page = await app.firstWindow();
const composerSel = '[data-slot="composer-root"] [contenteditable="true"]:visible';
try {
  await page.locator(composerSel).first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.locator(composerSel).first().click();
  await page.locator(composerSel).first().pressSequentially("Say hello");
  await page.keyboard.press("Enter");
  await page.getByText("Hello from the mock inference server", { exact: false }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(idleSeconds * 1000);
} finally {
  await app.close().catch(() => {});
  await mock.close();
}

// The net log is a JSON object; a clean shutdown closes the array, but tolerate a truncated tail.
let raw = fs.readFileSync(netLog, "utf8");
let log;
try { log = JSON.parse(raw); } catch { log = JSON.parse(raw.replace(/,\s*$/, "") + "]}"); }
const startType = log.constants?.logEventTypes?.REQUEST_ALIVE ?? log.constants?.logEventTypes?.URL_REQUEST_START_JOB;
const types = log.constants?.logEventTypes ?? {};
const startJob = types.URL_REQUEST_START_JOB;
const urls = new Map();
for (const ev of log.events ?? []) {
  if (ev.type !== startJob || !ev.params?.url) continue;
  let u;
  try { u = new URL(ev.params.url); } catch { continue; }
  if (!["http:", "https:", "ws:", "wss:"].includes(u.protocol)) continue;
  const key = `${u.protocol}//${u.host}`;
  urls.set(key, (urls.get(key) ?? 0) + 1);
}
const LOCAL = /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const rows = [...urls.entries()].map(([host, count]) => ({ host, count, external: !LOCAL.test(host) }));
fs.writeFileSync(outFile, JSON.stringify({ idleSeconds, rows }, null, 2));
fs.rmSync(root, { recursive: true, force: true });
for (const r of rows) console.log(`${r.external ? "EXTERNAL" : "local   "} ${r.host} x${r.count}`);
const external = rows.filter((r) => r.external);
console.log(`\n${rows.length} hosts, ${external.length} external (net log: URL_REQUEST_START_JOB events; ${idleSeconds}s idle after one chat turn)`);
process.exit(external.length ? 1 : 0);
