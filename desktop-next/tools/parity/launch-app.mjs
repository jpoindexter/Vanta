// Isolated launcher for the built desktop renderer: Electron + Hermes' mock inference
// server, a temp HERMES_HOME/HOME, no real credentials. Mirrors tools/launch-mock.mjs
// (kept separate so that file stays untouched) but returns a controllable handle.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY)$/;
const COMPOSER = '[data-slot="composer-root"] [contenteditable="true"]:visible';
const READY_TIMEOUT_MS = 120_000;

function sanitizedEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || SECRET.test(k) || (k.startsWith("HERMES_") && !k.startsWith("HERMES_DESKTOP_"))) continue;
    env[k] = v;
  }
  return Object.assign(env, extra);
}

function prepareSandbox(width, height) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-parity-"));
  const hermesHome = path.join(root, "hermes-home");
  const userData = path.join(root, "electron-user-data");
  fs.mkdirSync(hermesHome, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify({ x: 0, y: 0, width, height, isMaximized: false }));
  fs.writeFileSync(path.join(userData, "zoom-state.json"), JSON.stringify({ zoomLevel: 0 }));
  return { root, hermesHome, userData };
}

export async function launchMockApp({ desktopRoot, width, height }) {
  const hermesRepo = process.env.HERMES_REPO ?? path.join(os.homedir(), ".hermes", "hermes-agent");
  const require = createRequire(import.meta.url);
  const { _electron } = require("playwright-core");
  const importHermes = (rel) => import(pathToFileURL(path.join(hermesRepo, "tests-js", "scripts", rel)).href);
  const { startMockServer } = await importHermes("mock-server.ts");
  const { writeMockProviderConfig, writeEnvFile } = await importHermes("mock-provider-config.ts");

  const electronBin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  for (const f of [electronBin, path.join(desktopRoot, "dist", "electron-main.mjs"), path.join(desktopRoot, "dist", "index.html")]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Pass --desktop-root to a built apps/desktop (npm run build there).`);
  }
  const box = prepareSandbox(width, height);
  const mock = await startMockServer();
  writeMockProviderConfig(box.hermesHome, mock.url);
  writeEnvFile(box.hermesHome);
  const env = sanitizedEnv({
    HERMES_HOME: box.hermesHome,
    HERMES_DESKTOP_USER_DATA_DIR: box.userData,
    HERMES_DESKTOP_IGNORE_EXISTING: "1",
    HERMES_DESKTOP_ISOLATED_BACKEND: "1",
    HOME: box.root,
    HERMES_DESKTOP_HERMES_ROOT: hermesRepo,
    HERMES_DESKTOP_APP_NAME: `VantaParity-${Date.now()}`,
    HERMES_DESKTOP_SKIP_QUIT_CONFIRM: "1",
  });
  const app = await _electron.launch({ executablePath: electronBin, args: [desktopRoot, "--disable-gpu", "--no-sandbox"], env, cwd: desktopRoot });
  const page = await app.firstWindow();
  await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByText("Waiting for Hermes backend").first().waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  await page.getByText("Starting Hermes").first().waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  await page.waitForTimeout(500);
  const resize = (w, h) => app.evaluate(({ BrowserWindow }, [cw, ch]) => BrowserWindow.getAllWindows()[0].setContentSize(cw, ch), [w, h]);
  const close = async () => {
    await app.close().catch(() => {});
    await mock.close();
    // The Python backend can still be writing its cache as we exit; a leftover temp dir is harmless.
    try {
      fs.rmSync(box.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      // ignore
    }
  };
  return { page, resize, close };
}
