// Launch the built desktop renderer in Electron against Hermes' mock inference
// server with an isolated HERMES_HOME and HOME (never the real ~/.hermes).
//
//   node tools/launch-mock.mjs [--shots <dir>] [--keep-open]
//
// Needs: apps/desktop/dist built (npm run build in apps/desktop), the Electron
// binary installed, and a Hermes checkout for the Python backend + mock server
// (HERMES_REPO, default ~/.hermes/hermes-agent; read-only use).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = import.meta.dirname;
const desktopRoot = path.resolve(here, "..", "apps", "desktop");
const hermesRepo = process.env.HERMES_REPO ?? path.join(os.homedir(), ".hermes", "hermes-agent");
const args = process.argv.slice(2);
const shotsDir = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : "";
const keepOpen = args.includes("--keep-open");
const WIDTH = 1440;
const HEIGHT = 900;

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const importHermes = (rel) => import(pathToFileURL(path.join(hermesRepo, "tests-js", "scripts", rel)).href);
const { startMockServer } = await importHermes("mock-server.ts");
const { writeMockProviderConfig, writeEnvFile } = await importHermes("mock-provider-config.ts");

const electronBin = path.join(
  desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron",
);
for (const f of [electronBin, path.join(desktopRoot, "dist", "electron-main.mjs"), path.join(desktopRoot, "dist", "index.html")]) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Build apps/desktop and run node_modules/electron/install.js first.`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-desktop-next-"));
const hermesHome = path.join(root, "hermes-home");
const userData = path.join(root, "electron-user-data");
fs.mkdirSync(hermesHome, { recursive: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify({ x: 0, y: 0, width: WIDTH, height: HEIGHT, isMaximized: false }));
fs.writeFileSync(path.join(userData, "zoom-state.json"), JSON.stringify({ zoomLevel: 0 }));

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
  HERMES_HOME: hermesHome,
  HERMES_DESKTOP_USER_DATA_DIR: userData,
  HERMES_DESKTOP_IGNORE_EXISTING: "1",
  HERMES_DESKTOP_ISOLATED_BACKEND: "1",
  HOME: root,
  HERMES_DESKTOP_HERMES_ROOT: hermesRepo,
  HERMES_DESKTOP_APP_NAME: `VantaNextMock-${Date.now()}`,
  HERMES_DESKTOP_SKIP_QUIT_CONFIRM: "1",
});
console.log(`sandbox=${root}\nmock=${mock.url}`);

const app = await _electron.launch({
  executablePath: electronBin,
  args: [desktopRoot, "--disable-gpu", "--no-sandbox"],
  env,
  cwd: desktopRoot,
});
const page = await app.firstWindow();
page.on("console", (m) => { if (m.type() === "error") console.log(`[renderer:error] ${m.text().slice(0, 200)}`); });

const resize = () => app.evaluate(({ BrowserWindow }, [w, h]) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(w, h);
}, [WIDTH, HEIGHT]);
const shot = async (name) => {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await resize();
  await page.waitForTimeout(600);
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`shot ${file}`);
};
const composerSel = '[data-slot="composer-root"] [contenteditable="true"]:visible';
const waitReady = async () => {
  await page.locator(composerSel).first().waitFor({ state: "visible", timeout: 120_000 });
  await page.getByText("Waiting for Hermes backend").first().waitFor({ state: "detached", timeout: 120_000 });
  await page.getByText("Starting Hermes").first().waitFor({ state: "detached", timeout: 120_000 });
  await page.waitForTimeout(500);
};
// The renderer owns the mode (it pushes it to nativeTheme), so set its stored
// preference and reload instead of poking nativeTheme from the main process.
const theme = async (mode) => {
  await page.evaluate((m) => {
    localStorage.setItem("hermes-desktop-mode-v1", m);
    localStorage.removeItem("hermes-desktop-profile-modes-v1");
  }, mode);
  await page.reload();
  await waitReady();
};

let rc = 0;
try {
  const composer = page.locator(composerSel).first();
  await waitReady();
  await resize();
  await theme("light");
  await shot("1-empty-chat-light");
  await theme("dark");
  await shot("2-empty-chat-dark");

  await composer.click();
  await composer.pressSequentially("Say hello");
  await page.keyboard.press("Enter");
  await page.getByText("Hello from the mock inference server", { exact: false }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await shot("3-chat-after-reply-dark");
  await theme("light");
  await shot("4-chat-after-reply-light");
} catch (err) {
  rc = 1;
  console.error(`launch-mock failed: ${err.message}`);
  if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, "failure.png") }).catch(() => {}); }
}

if (keepOpen && rc === 0) {
  console.log("Window left open; Ctrl+C to quit.");
  await new Promise((r) => app.on("close", r));
}
await app.close().catch(() => {});
await mock.close();
fs.rmSync(root, { recursive: true, force: true });
process.exit(rc);
