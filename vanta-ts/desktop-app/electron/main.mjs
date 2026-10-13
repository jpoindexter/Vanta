import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, clipboard, shell, ipcMain, screen } from "electron";
import { createTrayController } from "./tray.mjs";
import { createDesktopPresence } from "./desktop-presence.mjs";
import { resolveDroppedPaths } from "./dropped-paths.mjs";
import { findAvailablePort, resolveProjectRoot, saveProjectSetting } from "./project-root.mjs";
import { resolveRuntimePaths } from "./runtime-paths.mjs";
import { serverLaunchArgs } from "./runtime-launch.mjs";
import { desktopRuntimeEnv } from "./runtime-env.mjs";
import { showProjectFolderPicker } from "./project-folder-picker.mjs";
import { createPendingProjectTaskStore, prepareProjectSwitch } from "./project-switch.mjs";
import { installMicrophonePermissions } from "./microphone-permissions.mjs";
import { createLaunchTrace, printRendererMarks } from "./launch-trace.mjs";
import { checkPackagedKernel } from "./smoke-kernel.mjs";
import { buildApplicationMenu } from "./app-menu.mjs";

const trace = createLaunchTrace();
trace("main loaded");
app.setName("Vanta");

const DEFAULT_DESKTOP_PORT = 7790;
// If the runtime is not listening this soon after the window exists, show the splash instead of a blank window.
const SPLASH_AFTER_MS = 600;
const RENDERER_MARKS_AFTER_MS = 4000;
const args = process.argv.slice(app.isPackaged ? 1 : 2);
const smoke = args.includes("--smoke");
const devtools = args.includes("--devtools");
const companion = !args.includes("--no-companion");
const automation = process.env.VANTA_DESKTOP_AUTOMATION === "1";
let serverProcess;
let mainWindow;
let trayController;
let desktopPresence;
let projectRoot;
let port = DEFAULT_DESKTOP_PORT;
let automationKernelUrl;
let shuttingDown = false;
let serverReady;
const pendingProjectTask = createPendingProjectTaskStore();
const boundaryToken = randomBytes(32).toString("hex");
process.env.VANTA_DESKTOP_BOUNDARY_TOKEN = boundaryToken;

ipcMain.handle("vanta:read-clipboard", () => {
  const image = clipboard.readImage();
  const png = image.isEmpty() ? null : image.toPNG();
  return {
    text: clipboard.readText(),
    image: png?.length ? { mime: "image/png", dataBase64: png.toString("base64"), bytes: png.length } : undefined,
  };
});

ipcMain.handle("vanta:resolve-dropped-paths", (_event, paths) =>
  resolveDroppedPaths(paths, projectRoot));

ipcMain.handle("vanta:pick-attachments", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Attach files or folders to Vanta",
    properties: ["openFile", "openDirectory", "multiSelections"],
  });
  if (result.canceled) return { files: [], items: [], errors: [] };
  return resolveDroppedPaths(result.filePaths, projectRoot);
});

ipcMain.handle("vanta:pick-project-folder", (_event, currentPath) =>
  showProjectFolderPicker({
    dialog,
    parentWindow: mainWindow,
    currentPath,
    fallbackPath: projectRoot,
  }));

ipcMain.handle("vanta:switch-project-for-new-task", async (_event, draft) => {
  const prepared = await prepareProjectSwitch(draft);
  await saveProjectSetting(app.getPath("userData"), prepared.targetRoot);
  pendingProjectTask.set(prepared);
  projectRoot = prepared.targetRoot;
  setImmediate(() => { void loadProject().catch((error) => showFatal(error instanceof Error ? error.message : String(error))); });
  return { switching: true, projectRoot };
});

ipcMain.handle("vanta:read-pending-project-task", () => pendingProjectTask.read(projectRoot));

ipcMain.handle("vanta:acknowledge-pending-project-task", (_event, id) => {
  if (typeof id !== "string" || id.length > 128) return false;
  return pendingProjectTask.acknowledge(id, projectRoot);
});

function runtimePaths() {
  const appPath = app.isPackaged ? app.getAppPath() : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return resolveRuntimePaths({ appPath, packaged: app.isPackaged, resourcesPath: process.resourcesPath, platform: process.platform });
}

function desktopIconPath() {
  const icon = runtimePaths().icon;
  return existsSync(icon) ? icon : undefined;
}

function startServer() {
  const paths = runtimePaths();
  const executable = app.isPackaged ? process.execPath : (process.env.VANTA_NODE || "node");
  const launch = serverLaunchArgs({ paths, port, companion });
  if (launch.runtime === "tsx") console.warn(`desktop runtime: tsx fallback (${launch.reason})`);
  const childArgs = launch.args;
  const env = {
    ...desktopRuntimeEnv(process.env),
    VANTA_DESKTOP_DIST: paths.dist,
    VANTA_PROJECT_ROOT: projectRoot,
    VANTA_KERNEL_BIN: paths.kernel,
    VANTA_DESKTOP_BOUNDARY_TOKEN: boundaryToken,
    ...(automationKernelUrl ? { VANTA_KERNEL_URL: automationKernelUrl, VANTA_KERNEL_EPHEMERAL: "1" } : {}),
  };
  if (app.isPackaged) Object.assign(env, { ELECTRON_RUN_AS_NODE: "1" });
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

/** Stop any running runtime, pick a port and spawn the server; resolves once it is listening. */
async function launchServer() {
  stopServer();
  desktopPresence?.reset();
  port = await findAvailablePort(Number(process.env.VANTA_DESKTOP_PORT) || DEFAULT_DESKTOP_PORT);
  if (automation && !process.env.VANTA_KERNEL_URL) {
    const preferredKernelPort = Number(process.env.VANTA_DESKTOP_KERNEL_PORT) || 22_000 + process.pid % 20_000;
    automationKernelUrl = `http://127.0.0.1:${await findAvailablePort(preferredKernelPort)}`;
  }
  startServer();
  trace("runtime spawned");
  const url = await waitForServer();
  trace("runtime listening");
  return url;
}

async function attachRenderer(url) {
  if (smoke) console.log(`desktop smoke: renderer assets ready at ${url}`);
  mainWindow.setTitle(`Vanta — ${basename(projectRoot)}`);
  if (!smoke) void loadRenderer(url);
  if (smoke) checkPackagedKernel(url, boundaryToken);
  if (smoke) console.log("desktop smoke: packaged kernel online");
  if (!smoke) trayController = createTrayController({ Tray, Menu, nativeImage, dialog, clipboard, app, baseUrl: url, boundaryToken,
    openWorkspace: (mode) => desktopPresence.setMode(mode), showAvatar: () => desktopPresence.showAvatar() });
}

async function loadRenderer(url) {
  trace("renderer load start");
  await mainWindow.loadURL(url).catch((error) => showFatal(`Desktop renderer failed: ${error.message}`));
  trace("renderer loaded");
  if (process.env.VANTA_LAUNCH_TRACE === "1") setTimeout(() => void printRendererMarks(mainWindow), RENDERER_MARKS_AFTER_MS);
}

/** Switch projects after the window exists: restart the runtime and reload the renderer. */
async function loadProject() {
  await attachRenderer(await launchServer());
}

async function chooseProject() {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Open a project in Vanta", properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return;
  projectRoot = result.filePaths[0];
  await saveProjectSetting(app.getPath("userData"), projectRoot);
  await loadProject();
}

function toggleDeveloperTools() {
  if (!mainWindow) return;
  if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
  else mainWindow.webContents.openDevTools({ mode: "detach", activate: true });
}

async function createWindow() {
  const icon = desktopIconPath();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 760, minHeight: 620, show: false,
    title: "Vanta", backgroundColor: "#ffffff", hasShadow: true,
    ...(icon ? { icon } : {}),
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 18 },
    } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(dirname(fileURLToPath(import.meta.url)), "preload.cjs"),
      additionalArguments: [`--vanta-desktop-boundary=${boundaryToken}`],
    },
  });
  mainWindow.once("ready-to-show", () => { trace("window visible"); if (!smoke) mainWindow.show(); });
  installMicrophonePermissions(mainWindow.webContents.session, { getWindow: () => mainWindow, getOrigin: () => `http://127.0.0.1:${port}` });
  desktopPresence = createDesktopPresence({ BrowserWindow, screen, ipcMain, getWindow: () => mainWindow });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (trustedRendererNavigation(target)) return;
    event.preventDefault();
  });
  mainWindow.on("close", (event) => { if (!shuttingDown && !smoke && !automation) { event.preventDefault(); mainWindow.hide(); } });
  trace("window created");
}

async function showSplash() {
  trace("splash shown");
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
}

function trustedRendererNavigation(target) {
  if (target.startsWith("data:text/html")) return true;
  try {
    const url = new URL(target);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && Number(url.port) === port;
  } catch {
    return false;
  }
}

function splashHtml() {
  return `<!doctype html><meta charset="utf-8"><title>Vanta</title><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#fff;color:#202024;font:14px system-ui}main{text-align:center}.mark{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 16px;border-radius:8px;background:#7c3aed;color:#fff;font-weight:800;font-size:20px}p{color:#51515a}</style><main><div class="mark">V</div><strong>Opening Vanta</strong><p>Loading your chats…</p></main>`;
}

async function initialProject() {
  const userData = app.getPath("userData");
  // Chat can begin in the ordinary default workspace. Project selection is an
  // explicit action, not a first-message prerequisite; saved choices still win.
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
const ownsInstance = automation || app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  app.on("before-quit", () => { shuttingDown = true; desktopPresence?.dispose(); stopServer(); });
  app.on("window-all-closed", () => { if (automation || process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { mainWindow?.show(); });
  // Spawn the runtime before Electron finishes initialising: the listener is up
  // by the time the window exists, so the first load is the real renderer.
  const earlyServer = initialProject().then((root) => { projectRoot = root; return launchServer(); });
  earlyServer.catch(() => undefined);
  app.whenReady().then(async () => {
    trace("app ready");
    await createWindow(); buildApplicationMenu({ app, chooseProject, getPresence: () => desktopPresence, toggleDeveloperTools });
    let url = smoke ? undefined : await Promise.race([earlyServer, delay(SPLASH_AFTER_MS).then(() => undefined)]);
    if (!url && !smoke) await showSplash();
    url ??= await earlyServer;
    await attachRenderer(url);
    if (devtools) mainWindow.webContents.openDevTools({ mode: "detach", activate: true });
    if (smoke) { console.log(`desktop native smoke ok: http://127.0.0.1:${port} · ${projectRoot}`); shuttingDown = true; app.quit(); }
  }).catch((error) => showFatal(error instanceof Error ? error.message : String(error)));
}
