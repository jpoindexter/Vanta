import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveArgoHome } from "../store/home.js";
import { buildLaunchdPlist } from "./launchd.js";

const run = promisify(execFile);

// launchctl side effects for the macOS gateway service. Foreground `argo
// gateway` works everywhere; this just keeps it alive in the background. Linux
// (systemd) is a future addition — install() errors clearly off macOS.

export const SERVICE_LABEL = "studio.theft.argo.gateway";

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
}

function assertMac(): void {
  if (process.platform !== "darwin") {
    throw new Error(
      "Service install supports macOS (launchd) only for now. Run `argo gateway` in the foreground, or add a systemd unit on Linux.",
    );
  }
}

export type ServiceStatus = {
  platform: string;
  installed: boolean;
  running: boolean;
  plistPath: string;
};

/**
 * Install + load the gateway as a launchd user agent. Idempotent: an existing
 * agent is unloaded first, then reloaded. Captures the current PATH so launchd's
 * minimal environment can still find node/cargo. Returns the plist path.
 */
export async function installService(repoRoot: string): Promise<string> {
  assertMac();
  const path = plistPath();
  const logPath = join(resolveArgoHome(), "gateway.log");
  const plist = buildLaunchdPlist({
    label: SERVICE_LABEL,
    programArgs: [join(repoRoot, "run.sh"), "gateway"],
    workingDir: repoRoot,
    logPath,
    pathDirs: (process.env.PATH ?? "").split(":").filter(Boolean),
  });

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, plist, "utf8");
  await run("launchctl", ["unload", path]).catch(() => {}); // ignore "not loaded"
  await run("launchctl", ["load", path]);
  return path;
}

/** Unload + remove the launchd agent. Idempotent. */
export async function uninstallService(): Promise<void> {
  assertMac();
  const path = plistPath();
  await run("launchctl", ["unload", path]).catch(() => {});
  if (existsSync(path)) await rm(path, { force: true });
}

/** Report install + running state. Read-only (safe to call anywhere). */
export async function serviceStatus(): Promise<ServiceStatus> {
  const path = plistPath();
  const installed = existsSync(path);
  let running = false;
  if (process.platform === "darwin") {
    const { stdout } = await run("launchctl", ["list"]).catch(() => ({ stdout: "" }));
    running = stdout.includes(SERVICE_LABEL);
  }
  return { platform: process.platform, installed, running, plistPath: path };
}
