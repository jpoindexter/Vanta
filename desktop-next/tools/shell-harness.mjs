// Shared harness for the shell proofs: boots the desktop renderer in Electron
// against Hermes' mock inference server with an isolated HERMES_HOME and HOME
// (never the real ~/.hermes), the same sandbox tools/launch-mock.mjs builds.
//
//   const h = await launchMockApp({ devServer })   // devServer optional (vite)
//   await h.resize(1440, 900); await h.theme('dark'); await h.shot(path)
//   await h.close()
//
// With a vite dev server the harness can import app modules from the page
// (`h.store(module)`) and drive the real stores, so states that need a live
// approval can be shown without changing production code.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = import.meta.dirname;
export const desktopRoot = path.resolve(here, "..", "apps", "desktop");
const hermesRepo = process.env.HERMES_REPO ?? path.join(os.homedir(), ".hermes", "hermes-agent");
const require = createRequire(import.meta.url);
const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY)$/;
const COMPOSER = '[data-slot="composer-root"] [contenteditable="true"]:visible';

const importHermes = (rel) => import(pathToFileURL(path.join(hermesRepo, "tests-js", "scripts", rel)).href);

function sandboxEnv(root, hermesHome, userData, devServer) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || SECRET.test(k) || (k.startsWith("HERMES_") && !k.startsWith("HERMES_DESKTOP_"))) continue;
    env[k] = v;
  }
  Object.assign(env, {
    HERMES_HOME: hermesHome,
    HERMES_DESKTOP_USER_DATA_DIR: userData,
    HERMES_DESKTOP_IGNORE_EXISTING: "1",
    HERMES_DESKTOP_ISOLATED_BACKEND: "1",
    HOME: root,
    HERMES_DESKTOP_HERMES_ROOT: hermesRepo,
    HERMES_DESKTOP_APP_NAME: `VantaShellProof-${Date.now()}`,
    HERMES_DESKTOP_SKIP_QUIT_CONFIRM: "1",
  });
  if (devServer) env.HERMES_DESKTOP_DEV_SERVER = devServer;
  return env;
}

export async function launchMockApp({ devServer = "", width = 1440, height = 900 } = {}) {
  const { _electron } = require("playwright-core");
  const { startMockServer } = await importHermes("mock-server.ts");
  const { writeMockProviderConfig, writeEnvFile } = await importHermes("mock-provider-config.ts");
  const electronBin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-shell-proof-"));
  const hermesHome = path.join(root, "hermes-home");
  const userData = path.join(root, "electron-user-data");
  fs.mkdirSync(hermesHome, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify({ x: 0, y: 0, width, height, isMaximized: false }));
  fs.writeFileSync(path.join(userData, "zoom-state.json"), JSON.stringify({ zoomLevel: 0 }));

  const mock = await startMockServer();
  writeMockProviderConfig(hermesHome, mock.url);
  writeEnvFile(hermesHome);

  const app = await _electron.launch({
    executablePath: electronBin,
    args: [desktopRoot, "--disable-gpu", "--no-sandbox"],
    env: sandboxEnv(root, hermesHome, userData, devServer),
    cwd: desktopRoot,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });

  const resize = async (w, h) => {
    await app.evaluate(({ BrowserWindow }, [cw, ch]) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(320, 320);
      win.setContentSize(cw, ch);
    }, [w, h]);
    await page.waitForTimeout(500);
  };

  const waitReady = async () => {
    await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 120_000 });
    await page.getByText("Waiting for Hermes backend").first().waitFor({ state: "detached", timeout: 120_000 });
    await page.getByText("Starting Hermes").first().waitFor({ state: "detached", timeout: 120_000 });
    await page.waitForTimeout(500);
  };

  const theme = async (mode) => {
    await page.evaluate((m) => {
      localStorage.setItem("hermes-desktop-mode-v1", m);
      localStorage.removeItem("hermes-desktop-profile-modes-v1");
    }, mode);
    await page.reload();
    await waitReady();
  };

  const close = async () => {
    await app.close().catch(() => {});
    await mock.close();
    fs.rmSync(root, { recursive: true, force: true });
  };

  return {
    app, page, errors, resize, waitReady, theme, close, composer: COMPOSER,
    shot: async (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await page.screenshot({ path: file }); },
  };
}

/** Import an app source module inside the page (dev server only) and run `fn`
 *  against it, so a proof can drive the real stores. */
export const withModule = (page, specifier, fn, arg) =>
  page.evaluate(async ([spec, source, a]) => {
    const mod = await import(/* @vite-ignore */ spec);
    // eslint-disable-next-line no-new-func
    return new Function("mod", "arg", `return (${source})(mod, arg)`)(mod, a);
  }, [specifier, fn.toString(), arg]);
