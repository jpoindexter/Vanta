// Sandbox + launcher for the done-path proof. Every run owns one root directory holding its own
// VANTA_HOME, HOME, Electron userData and two throwaway git projects; the same root is reused
// across the quit/relaunch so persistence is real. Nothing under the owner's home is touched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

import { desktopRoot } from "../vanta-app.mjs";

const here = import.meta.dirname;
const repoRoot = path.resolve(here, "..", "..", "..");
const require = createRequire(import.meta.url);
const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY|_KEY)$/;
export const ORIGINAL_BRIEF = "# Local brief\nNo operator data.\n";

function makeProject(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "brief.md"), ORIGINAL_BRIEF);
  fs.writeFileSync(path.join(dir, "deploy-notes.md"), "# Deploy notes\nplain text\n");
  fs.writeFileSync(path.join(dir, "production-plan.md"), "# Production plan\nplain text\n");
  fs.writeFileSync(path.join(dir, "README.md"), `# ${name}\n`);
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "add", ".");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "commit", "-q", "-m", "init");
}

/** A free loopback port, so the run's kernel never shares the default 7788 with the owner's own app. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** One isolated root: HOME, VANTA_HOME, userData and projects A and B. */
export async function makeSandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vanta-donepath-")));
  const box = {
    root,
    home: path.join(root, "home"),
    vantaHome: path.join(root, "vanta-home"),
    userData: path.join(root, "user-data"),
    projectA: path.join(root, "project", "alpha"),
    projectB: path.join(root, "project", "bravo"),
    permissionsFile: path.join(root, "vanta-home", "permissions.tsv"),
    kernelPort: await freePort(),
  };
  for (const dir of [box.home, box.vantaHome, box.userData]) fs.mkdirSync(dir, { recursive: true });
  makeProject(box.projectA, "alpha");
  makeProject(box.projectB, "bravo");
  return box;
}

export const readPermissions = (box) => (fs.existsSync(box.permissionsFile) ? fs.readFileSync(box.permissionsFile, "utf8") : "(file absent)");

function sandboxEnv({ box, project, modelUrl }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && !SECRET.test(key) && !key.startsWith("VANTA_") && !key.startsWith("HERMES_")) env[key] = value;
  }
  return Object.assign(env, {
    HOME: box.home,
    VANTA_HOME: box.vantaHome,
    VANTA_PROJECT_ROOT: project,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: modelUrl,
    VANTA_OPENAI_KEY: "proof",
    VANTA_MODEL: "done-path",
    VANTA_RUNTIME_ROOT: path.join(repoRoot, "vanta-ts"),
    VANTA_KERNEL_URL: `http://127.0.0.1:${box.kernelPort}`,
    // A frontier-size window: with the 32k default the context pipeline legitimately snips a 200 KB message to 4000 chars.
    VANTA_CONTEXT_WINDOW: "1000000",
    VANTA_SKIP_QUIT_CONFIRM: "1",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_PROMPT_SUGGESTIONS: "0",
    VANTA_OPERATING_MODE: "default",
    VANTA_PERMISSION_MODE: "default",
    NODE_OPTIONS: `--require ${path.join(here, "..", "hidden-window.cjs")}`,
  });
}

/** Launch the built Electron shell on `project`, hidden and unfocused. */
export async function launchApp({ box, project, modelUrl, width = 1440, height = 900 }) {
  const { _electron } = require("playwright-core");
  const bin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  const app = await _electron.launch({
    executablePath: bin,
    args: [desktopRoot, `--user-data-dir=${box.userData}`, "--disable-gpu", "--no-sandbox", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
    env: sandboxEnv({ box, project, modelUrl }),
    cwd: desktopRoot,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  const pid = app.process().pid;
  const resize = async (w, h) => {
    await app.evaluate(({ BrowserWindow }, [cw, ch]) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(300, 300);
      win.setContentSize(cw, ch);
    }, [w, h]);
    await page.waitForTimeout(400);
  };
  await resize(width, height);
  return { app, page, errors, resize, pid };
}

/** PIDs of any process still running with this sandbox root on its command line. */
export function leftoverProcesses(box) {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    return out.split("\n").filter((line) => line.includes(box.root) && !line.includes("ps -axo")).map((line) => line.trim().slice(0, 160));
  } catch { return []; }
}

export function killLeftovers(box) {
  killKernel(box);
  for (const line of leftoverProcesses(box)) {
    const pid = Number(line.split(/\s+/)[0]);
    if (pid && pid !== process.pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
  }
}

/** Every descendant pid of `root` (children, grandchildren, ...). */
export function descendants(root) {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
  const found = [];
  const queue = [root];
  while (queue.length) {
    const parent = queue.shift();
    for (const [pid, ppid] of rows) if (ppid === parent && !found.includes(pid)) { found.push(pid); queue.push(pid); }
  }
  return found;
}

export const stillAlive = (pids) => pids.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });

export const commandOf = (pid) => {
  try { return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim().slice(0, 140); } catch { return "(gone)"; }
};

/** The kernel is a detached daemon by design (it outlives the app); find it by the run's private port. */
export function kernelPids(box) {
  try {
    return execFileSync("lsof", ["-t", `-iTCP:${box.kernelPort}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch { return []; }
}

export function killKernel(box) {
  for (const pid of kernelPids(box)) { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
}
