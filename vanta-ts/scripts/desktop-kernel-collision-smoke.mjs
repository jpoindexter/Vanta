import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const runId = `${process.pid}-${Date.now()}`;
const target = `/tmp/vanta-packaged-collision-target-${runId}`;
const owner = `/tmp/vanta-packaged-collision-owner-${runId}`;
const defaultOwner = `/tmp/vanta-packaged-default-owner-${runId}`;
const userData = `/tmp/vanta-packaged-collision-profile-${runId}`;
const kernel = resolve("release/mac-arm64/Vanta.app/Contents/Resources/kernel/vanta-kernel");
const app = resolve("release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");

function scopedPort(root) {
  const digest = createHash("sha256").update(resolve(root)).digest();
  return 17_000 + digest.readUInt32BE(0) % 4_000;
}

async function waitForRoot(url, root, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${url}/api/status`);
      const status = await response.json();
      if (status.root === root) return status;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Kernel did not advertise ${root} at ${url}.`);
}

async function statusAt(url) {
  try {
    const response = await fetch(`${url}/api/status`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function startKernel(root, port) {
  return spawn(kernel, ["serve", String(port)], {
    cwd: root,
    env: { ...process.env, VANTA_ROOT: root },
    stdio: "ignore",
  });
}

function stop(child) {
  if (child && !child.killed) child.kill("SIGTERM");
}

await Promise.all([
  mkdir(target, { recursive: true }),
  mkdir(owner, { recursive: true }),
  mkdir(defaultOwner, { recursive: true }),
  mkdir(userData, { recursive: true }),
]);

let defaultKernel;
let blocker;
try {
  const defaultStatus = await statusAt("http://127.0.0.1:7788");
  if (!defaultStatus) {
    defaultKernel = startKernel(defaultOwner, 7788);
    await waitForRoot("http://127.0.0.1:7788", defaultOwner);
  }

  const preferred = scopedPort(target);
  const fallback = 17_000 + (preferred - 17_000 + 1) % 4_000;
  blocker = startKernel(owner, preferred);
  await waitForRoot(`http://127.0.0.1:${preferred}`, owner);

  const env = {
    ...process.env,
    VANTA_DESKTOP_USER_DATA: userData,
    VANTA_KERNEL_EPHEMERAL: "1",
  };
  delete env.VANTA_KERNEL_URL;
  delete env.VANTA_DESKTOP_AUTOMATION;

  const desktop = spawn(app, ["--smoke", "--project", target, "--no-companion"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  desktop.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  desktop.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  const exitCode = await Promise.race([
    new Promise((resolveExit, reject) => {
      desktop.once("error", reject);
      desktop.once("exit", resolveExit);
    }),
    new Promise((_, reject) => setTimeout(() => {
      desktop.kill("SIGTERM");
      reject(new Error("Packaged collision smoke timed out."));
    }, 60_000)),
  ]);

  if (exitCode !== 0 || !output.includes("desktop native smoke ok")) {
    throw new Error(`Packaged collision smoke failed with exit code ${exitCode}.`);
  }
  if (output.includes("already owned by")) throw new Error("Desktop still reported a scoped collision.");
  await waitForRoot(`http://127.0.0.1:${preferred}`, owner);
  console.log(`desktop kernel collision smoke ok: owner ${preferred} preserved · project fallback ${fallback}`);
} finally {
  stop(blocker);
  stop(defaultKernel);
}
