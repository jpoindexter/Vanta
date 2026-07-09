import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, clipboard } from "electron";
import { createTrayController } from "./tray.mjs";

const DEFAULT_DESKTOP_PORT = 7790;

function parsePort(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DESKTOP_PORT;
}

function parseNativeShellArgs(args, env) {
  const portArg = args.find((arg) => /^\d+$/.test(arg));
  const port = parsePort(portArg ?? env.VANTA_DESKTOP_PORT);
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    smoke: args.includes("--smoke"),
    devtools: args.includes("--devtools"),
    companion: !args.includes("--no-companion"),
    nodeBin: env.VANTA_NODE || "node",
  };
}

function desktopServerArgs(plan) {
  return ["--import", "tsx", "src/cli.ts", "desktop", String(plan.port), "--no-open", ...(plan.companion ? ["--companion"] : [])];
}

const plan = parseNativeShellArgs(process.argv.slice(2), process.env);
let serverProcess;
let mainWindow;
let trayController;
let shuttingDown = false;

function startServer() {
  serverProcess = spawn(plan.nodeBin, desktopServerArgs(plan), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  serverProcess.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`vanta desktop server exited (${signal ?? code ?? "unknown"})`);
      app.quit();
    }
  });
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(plan.url);
      if (res.ok) return;
    } catch {
      // The child server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${plan.url}`);
}

function stopServer() {
  shuttingDown = true;
  trayController?.dispose();
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill("SIGTERM");
}

async function createWindow() {
  await waitForServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    show: true,
    title: "Vanta",
    backgroundColor: "#0b0d10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (plan.devtools) mainWindow.webContents.openDevTools({ mode: "detach" });
  await mainWindow.loadURL(plan.url);
  mainWindow.on("close", (event) => {
    if (!shuttingDown && !plan.smoke) { event.preventDefault(); mainWindow.hide(); }
  });

  trayController = createTrayController({ Tray, Menu, nativeImage, dialog, clipboard, BrowserWindow, app, baseUrl: plan.url });
  if (process.env.VANTA_DESKTOP_SMOKE_EXPOSE_TRAY === "1") globalThis.__vantaTrayController = trayController;

  if (plan.smoke) {
    console.log(`desktop native smoke ok: ${plan.url}`);
    app.quit();
  }
}

app.on("window-all-closed", () => { if (shuttingDown) app.quit(); });
app.on("before-quit", stopServer);

app.whenReady().then(() => {
  startServer();
  return createWindow();
}).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  app.exit(1);
});
