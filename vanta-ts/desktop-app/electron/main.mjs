import { execFileSync, spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, clipboard, shell } from "electron";
import { createTrayController } from "./tray.mjs";
import { findAvailablePort, projectArg, readProjectSetting, resolveProjectRoot, saveProjectSetting } from "./project-root.mjs";

const DEFAULT_DESKTOP_PORT = 7790;
const args = process.argv.slice(app.isPackaged ? 1 : 2);
const smoke = args.includes("--smoke");
const devtools = args.includes("--devtools");
const companion = !args.includes("--no-companion");
const automation = process.env.VANTA_DESKTOP_AUTOMATION === "1";
let serverProcess;
let mainWindow;
let trayController;
let projectRoot;
let port = DEFAULT_DESKTOP_PORT;
let shuttingDown = false;
let serverReady;

function runtimePaths() {
  const appPath = app.isPackaged ? app.getAppPath() : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const loaderRoot = app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked") : appPath;
  return {
    cli: join(appPath, "src", "cli.ts"),
    loader: join(loaderRoot, "node_modules", "tsx", "dist", "loader.mjs"),
    dist: join(appPath, "desktop-app", "dist"),
    kernel: join(process.resourcesPath, "kernel", process.platform === "win32" ? "vanta-kernel.exe" : "vanta-kernel"),
  };
}

function startServer() {
  const paths = runtimePaths();
  const executable = app.isPackaged ? process.execPath : (process.env.VANTA_NODE || "node");
  const childArgs = ["--import", pathToFileURL(paths.loader).href, paths.cli, "desktop", String(port), "--no-open", ...(companion ? ["--companion"] : [])];
  const env = { ...process.env, VANTA_DESKTOP_DIST: paths.dist, VANTA_PROJECT_ROOT: projectRoot };
  if (app.isPackaged) Object.assign(env, { ELECTRON_RUN_AS_NODE: "1", VANTA_KERNEL_BIN: paths.kernel });
  const child = spawn(executable, childArgs, { cwd: projectRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  serverProcess = child;
  serverReady = new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk); output += chunk.toString();
      if (output.includes("vanta desktop —")) resolve();
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code) => { if (!output.includes("vanta desktop —")) reject(new Error(`Vanta runtime exited before listening (${code ?? "unknown"}).`)); });
  });
  child.once("error", (error) => showFatal(`Could not launch the Vanta runtime: ${error.message}`));
  child.once("exit", (code, signal) => {
    if (!shuttingDown && serverProcess === child && !child.killed) showFatal(`Vanta runtime exited (${signal ?? code ?? "unknown"}).`);
  });
}

async function waitForServer() {
  const url = `http://127.0.0.1:${port}`;
  await Promise.race([
    serverReady,
    delay(app.isPackaged ? 60_000 : 20_000).then(() => { throw new Error(`Timed out waiting for the Vanta runtime on port ${port}.`); }),
  ]);
  return url;
}

function stopServer() {
  trayController?.dispose();
  trayController = undefined;
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill("SIGTERM");
  serverProcess = undefined;
}

async function loadProject() {
  stopServer();
  port = await findAvailablePort(Number(process.env.VANTA_DESKTOP_PORT) || DEFAULT_DESKTOP_PORT);
  startServer();
  const url = await waitForServer();
  if (smoke) console.log(`desktop smoke: renderer assets ready at ${url}`);
  mainWindow.setTitle(`Vanta — ${basename(projectRoot)}`);
  if (!smoke) void mainWindow.loadURL(url).catch((error) => showFatal(`Desktop renderer failed: ${error.message}`));
  if (smoke) await waitForKernel(url);
  if (smoke) console.log("desktop smoke: packaged kernel online");
  if (!smoke) trayController = createTrayController({ Tray, Menu, nativeImage, dialog, clipboard, BrowserWindow, app, baseUrl: url });
}

async function waitForKernel(url) {
  const root = execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "60", url], { encoding: "utf8" });
  if (!root.includes('id="root"')) throw new Error("Packaged renderer asset did not contain the Vanta root.");
  try {
    const status = JSON.parse(execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "60", `${url}/api/status`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    if (status.kernel !== "online") throw new Error(`Packaged kernel reported ${status.kernel ?? "unknown"}.`);
  } catch {
    const setup = JSON.parse(execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "10", `${url}/api/setup`], { encoding: "utf8" }));
    if (!Array.isArray(setup) || setup.length === 0) throw new Error("Packaged first-run setup is unavailable.");
    console.log("desktop smoke: first-run model setup ready");
  }
}

async function chooseProject() {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Open a project in Vanta", properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return;
  projectRoot = result.filePaths[0];
  await saveProjectSetting(app.getPath("userData"), projectRoot);
  await loadProject();
}

function buildApplicationMenu() {
  const template = [
    { label: "Vanta", submenu: [
      { label: "About Vanta", role: "about" }, { type: "separator" },
      { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => { void chooseProject(); } },
      { label: "Show Vanta", accelerator: "CmdOrCtrl+Shift+V", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" },
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { label: "Developer Tools", accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I", visible: !app.isPackaged, click: () => toggleDeveloperTools() }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function toggleDeveloperTools() {
  if (!mainWindow) return;
  if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
  else mainWindow.webContents.openDevTools({ mode: "detach", activate: true });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 760, minHeight: 620, show: false,
    title: "Vanta", backgroundColor: "#191a1b",
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 18 },
    } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("ready-to-show", () => { if (!smoke) mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  mainWindow.on("close", (event) => { if (!shuttingDown && !smoke && !automation) { event.preventDefault(); mainWindow.hide(); } });
  if (!smoke) await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
}

function splashHtml() {
  return `<!doctype html><meta charset="utf-8"><title>Vanta</title><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#191a1b;color:#f2f0eb;font:14px system-ui}main{text-align:center}.mark{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 16px;border-radius:8px;background:#f2f0eb;color:#191a1b;font-weight:800;font-size:20px}p{color:#aaa7a0}</style><main><div class="mark">V</div><strong>Opening Vanta</strong><p>Loading the local runtime and kernel…</p></main>`;
}

async function initialProject() {
  const userData = app.getPath("userData");
  const saved = await readProjectSetting(userData);
  if (app.isPackaged && !projectArg(args) && !process.env.VANTA_PROJECT_ROOT && !saved) {
    const result = await dialog.showOpenDialog({ title: "Choose where Vanta should work", properties: ["openDirectory", "createDirectory"] });
    if (!result.canceled && result.filePaths[0]) await saveProjectSetting(userData, result.filePaths[0]);
  }
  return resolveProjectRoot({ args, env: process.env, userData, cwd: app.isPackaged ? homedir() : process.cwd() });
}

function showFatal(message) {
  if (smoke || automation) { console.error(message); shuttingDown = true; app.exit(1); return; }
  dialog.showErrorBox("Vanta could not start", `${message}\n\nProject: ${projectRoot ?? "not selected"}`);
  app.quit();
}

// Test and automation runs use an isolated profile so they never contend with
// the operator's running Vanta instance or mutate its remembered project.
if (process.env.VANTA_DESKTOP_USER_DATA) app.setPath("userData", process.env.VANTA_DESKTOP_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  app.on("before-quit", () => { shuttingDown = true; stopServer(); });
  app.on("window-all-closed", () => { if (automation || process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { mainWindow?.show(); });
  app.whenReady().then(async () => {
    projectRoot = await initialProject();
    await createWindow(); buildApplicationMenu(); await loadProject();
    if (devtools) mainWindow.webContents.openDevTools({ mode: "detach", activate: true });
    if (smoke) { console.log(`desktop native smoke ok: http://127.0.0.1:${port} · ${projectRoot}`); shuttingDown = true; app.quit(); }
  }).catch((error) => showFatal(error instanceof Error ? error.message : String(error)));
}
