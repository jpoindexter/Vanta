// Launches the built Vanta desktop (Electron shell + the real Vanta server) in a sandbox:
// its own VANTA_HOME, HOME, Electron userData and a throwaway project. Nothing under the
// owner's ~/.vanta or the installed apps is read or written. A local mock model answers chats.
//
//   const app = await launchVanta({ hidden: true })
//   await app.resize(1440, 900); await app.shot("out.png"); await app.close()
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

import { PIXEL, startMockOpenAI } from "./mock-openai.mjs";

const here = import.meta.dirname;
export const desktopRoot = path.resolve(here, "..", "apps", "desktop");
const repoRoot = path.resolve(here, "..", "..");
const require = createRequire(import.meta.url);
const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY|_KEY)$/;

function electronBinary() {
  const bin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  for (const file of [bin, path.join(desktopRoot, "dist", "electron-main.mjs"), path.join(desktopRoot, "dist", "index.html")]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${file}. Run: npm run vanta:build (see docs/RUN.md).`);
    }
  }
  return bin;
}

function makeProject(root) {
  const project = path.join(root, "project", "acme-site");
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  fs.writeFileSync(path.join(project, "README.md"), "# Acme site\n\nA small project for trying Vanta.\n");
  fs.writeFileSync(path.join(project, "src", "index.ts"), "export const greeting = 'hello'\n");
  // A committed image the scripted model can show in a chat (the renderer blocks remote and data: images).
  fs.writeFileSync(path.join(project, "pixel.png"), Buffer.from(PIXEL, "base64"));
  // One schedule so Schedules, Home's Next up and the sidebar's cron section have data to show.
  fs.mkdirSync(path.join(project, ".vanta"), { recursive: true });
  fs.writeFileSync(path.join(project, ".vanta", "cron.tsv"), "1\t0 9 * * 1\tWeekly competitor brief\tactive\t\t\n");
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "add", ".");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "commit", "-q", "-m", "init");
  return project;
}

function sandboxEnv({ root, project, modelUrl, hidden, kernelPort }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && !SECRET.test(key) && !key.startsWith("VANTA_") && !key.startsWith("HERMES_")) env[key] = value;
  }
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  Object.assign(env, {
    HOME: home,
    VANTA_HOME: path.join(root, "vanta-home"),
    VANTA_PROJECT_ROOT: project,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: modelUrl,
    VANTA_OPENAI_KEY: "proof",
    VANTA_MODEL: "vanta-proof",
    VANTA_RUNTIME_ROOT: path.join(repoRoot, "vanta-ts"),
    VANTA_SKIP_QUIT_CONFIRM: "1",
    // A free port, so the sandbox kernel never collides with the owner's own app on the default 7788.
    VANTA_KERNEL_URL: `http://127.0.0.1:${kernelPort}`,
  });
  return env;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Start the app. `hidden` (default) keeps the window off-screen and inactive. */
export async function launchVanta({ hidden = true, width = 1440, height = 900, seed } = {}) {
  const { _electron } = require("playwright-core");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-desktop-"));
  const project = makeProject(root);
  // Seed before the app starts: files under the sandbox's VANTA_HOME or project that the first screen should already show.
  if (seed) await seed({ project, root, vantaHome: path.join(root, "vanta-home") });
  const mock = await startMockOpenAI({ imagePath: path.join(project, "pixel.png") });
  const userData = path.join(root, "user-data");
  fs.mkdirSync(userData, { recursive: true });
  // The tray is on by default and Electron's Tray cannot be replaced; start with it off so a proof run
  // leaves no icon in the owner's menu bar. A run that tests the tray setting turns it on for a moment.
  fs.writeFileSync(path.join(userData, "tray.json"), JSON.stringify({ enabled: false }));

  const app = await _electron.launch({
    executablePath: electronBinary(),
    args: [
      // Electron strips NODE_OPTIONS in the main process; a --require argument is what reaches it.
      ...(hidden ? ["--require", path.join(here, "hidden-window.cjs")] : []),
      desktopRoot,
      `--user-data-dir=${userData}`,
      "--disable-gpu",
      "--no-sandbox",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
    env: sandboxEnv({ root, project, modelUrl: mock.url, hidden, kernelPort: await freePort() }),
    cwd: desktopRoot,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text().slice(0, 300)));
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));

  const resize = async (w, h) => {
    await app.evaluate(({ BrowserWindow }, [cw, ch]) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(300, 300);
      win.setContentSize(cw, ch);
    }, [w, h]);
    await page.waitForTimeout(500);
  };
  await resize(width, height);

  return {
    app,
    page,
    root,
    project,
    modelUrl: mock.url,
    errors,
    resize,
    async shot(file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file });
    },
    async close() {
      await app.close().catch(() => undefined);
      await mock.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Wait until the shell is on screen and the Vanta server answers. */
export async function waitForShell(page, timeout = 90_000) {
  await page.locator("[data-vanta-titlebar]").first().waitFor({ state: "visible", timeout });
  await page.locator("[data-tour='sessions-sidebar'], [data-testid='home-surface'], [data-slot='composer-root']").first().waitFor({ state: "attached", timeout });
  await page.waitForTimeout(800);
}
