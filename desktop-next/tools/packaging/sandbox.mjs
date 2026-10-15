// An isolated sandbox for launching the packaged app: its own HOME, VANTA_HOME, user data and a throwaway git project.
// Nothing under the owner's ~/.vanta or the installed Vanta.app is read or written.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY|_KEY)$/;

function makeProject(root) {
  const project = path.join(root, "project", "acme-site");
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  fs.writeFileSync(path.join(project, "README.md"), "# Acme site\n\nA small project for the packaging proof.\n");
  fs.writeFileSync(path.join(project, "src", "index.ts"), "export const greeting = 'hello'\n");
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "add", ".");
  git("-c", "user.email=proof@example.test", "-c", "user.name=Proof", "commit", "-q", "-m", "init");
  return project;
}

/**
 * `hiddenWindow` is the proof preload that keeps windows off-screen and inactive. VANTA_RUNTIME_ROOT and
 * VANTA_KERNEL_BIN are deliberately NOT set: the app must find its own runtime and kernel inside the bundle.
 */
export function createSandbox({ modelUrl, hiddenWindow }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-next-pkg-"));
  const project = makeProject(root);
  const home = path.join(root, "home");
  const userData = path.join(root, "user-data");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && !SECRET.test(key) && !key.startsWith("VANTA_") && !key.startsWith("HERMES_") && key !== "NODE_OPTIONS") env[key] = value;
  }
  Object.assign(env, {
    HOME: home,
    VANTA_HOME: path.join(root, "vanta-home"),
    VANTA_PROJECT_ROOT: project,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: modelUrl,
    VANTA_OPENAI_KEY: "proof",
    VANTA_MODEL: "vanta-proof",
    VANTA_SKIP_QUIT_CONFIRM: "1",
    NODE_OPTIONS: `--require ${hiddenWindow}`,
  });
  return { root, project, userData, env, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
