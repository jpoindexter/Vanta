import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { promisify } from "node:util";
import { resolveVantaHome } from "../store/home.js";
import { buildLaunchdPlist } from "./launchd.js";
import { buildSystemdUnit, SERVICE_MARKER } from "./systemd.js";
import { buildTaskXml } from "./windows.js";

export const SERVICE_LABEL = "studio.theft.vanta.gateway";
const SYSTEMD_NAME = "vanta-gateway.service";
const WINDOWS_NAME = "VantaGateway";
type Platform = NodeJS.Platform;
type Exec = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export type ServiceStatus = {
  platform: string;
  installed: boolean;
  running: boolean;
  stale?: boolean;
  artifactPath?: string;
  plistPath: string;
  logPath?: string;
  detail?: string;
};

export type ServiceManager = {
  install(repoRoot: string): Promise<string>;
  uninstall(): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<ServiceStatus>;
  logs(lines?: number): Promise<string>;
};

type ManagerOptions = { platform?: Platform; home?: string; vantaHome?: string; exec?: Exec };

function defaultExec(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return promisify(execFile)(file, args).then(({ stdout, stderr }) => ({ stdout, stderr }));
}

async function owned(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const bytes = await readFile(path);
  const content = bytes.includes(0) ? bytes.toString("utf16le") : bytes.toString("utf8");
  return content.includes(SERVICE_MARKER);
}

async function tail(path: string, lines: number): Promise<string> {
  if (!existsSync(path)) return "(no service logs yet)";
  return (await readFile(path, "utf8")).split(/\r?\n/).slice(-Math.max(1, lines)).join("\n");
}

export function createServiceManager(options: ManagerOptions = {}): ServiceManager {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const vantaHome = options.vantaHome ?? resolveVantaHome();
  const run = options.exec ?? defaultExec;
  const logPath = join(vantaHome, "gateway.log");
  const artifactPath = platform === "darwin"
    ? join(home, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`)
    : platform === "linux"
      ? join(home, ".config", "systemd", "user", SYSTEMD_NAME)
      : join(vantaHome, "service", "vanta-gateway.xml");

  function requireSupported(): void {
    if (!(["darwin", "linux", "win32"] as string[]).includes(platform)) {
      throw new Error(`Background service is not supported on ${platform}; run \`vanta gateway\` in the foreground.`);
    }
  }

  async function install(repoRoot: string): Promise<string> {
    requireSupported();
    await mkdir(dirname(artifactPath), { recursive: true });
    await mkdir(dirname(logPath), { recursive: true });
    if (platform === "darwin") {
      const plist = buildLaunchdPlist({ label: SERVICE_LABEL, programArgs: [join(repoRoot, "run.sh"), "gateway"], workingDir: repoRoot, logPath, pathDirs: (process.env.PATH ?? "").split(":").filter(Boolean) });
      await writeFile(artifactPath, plist.replace("<plist version=\"1.0\">", `<plist version=\"1.0\">\n<!-- ${SERVICE_MARKER} -->`), "utf8");
      await run("launchctl", ["unload", artifactPath]).catch(() => ({ stdout: "", stderr: "" }));
      await run("launchctl", ["load", artifactPath]);
    } else if (platform === "linux") {
      await writeFile(artifactPath, buildSystemdUnit({ command: join(repoRoot, "run.sh"), args: ["gateway"], workingDir: repoRoot, logPath }), "utf8");
      await run("systemctl", ["--user", "daemon-reload"]);
      await run("systemctl", ["--user", "enable", "--now", SYSTEMD_NAME]);
    } else {
      const command = win32.join(repoRoot, "run.ps1");
      await writeFile(artifactPath, buildTaskXml({ command, args: ["gateway"], workingDir: repoRoot, logPath }), "utf16le");
      await run("schtasks", ["/Create", "/TN", WINDOWS_NAME, "/XML", artifactPath, "/F"]);
      await run("schtasks", ["/Run", "/TN", WINDOWS_NAME]);
    }
    return artifactPath;
  }

  async function uninstall(): Promise<void> {
    requireSupported();
    if (!existsSync(artifactPath)) return;
    if (!(await owned(artifactPath))) throw new Error(`Refusing to remove ${artifactPath}: artifact is not Vanta-owned.`);
    if (platform === "darwin") await run("launchctl", ["unload", artifactPath]).catch(() => ({ stdout: "", stderr: "" }));
    if (platform === "linux") {
      await run("systemctl", ["--user", "disable", "--now", SYSTEMD_NAME]).catch(() => ({ stdout: "", stderr: "" }));
      await run("systemctl", ["--user", "daemon-reload"]);
    }
    if (platform === "win32") await run("schtasks", ["/Delete", "/TN", WINDOWS_NAME, "/F"]).catch(() => ({ stdout: "", stderr: "" }));
    await rm(artifactPath, { force: true });
  }

  async function stop(): Promise<void> {
    requireSupported();
    if (platform === "darwin") await run("launchctl", ["unload", artifactPath]);
    if (platform === "linux") await run("systemctl", ["--user", "stop", SYSTEMD_NAME]);
    if (platform === "win32") await run("schtasks", ["/End", "/TN", WINDOWS_NAME]);
  }

  async function restart(): Promise<void> {
    requireSupported();
    if (!existsSync(artifactPath)) throw new Error("Service is not installed. Run `vanta up` first.");
    if (platform === "darwin") { await run("launchctl", ["unload", artifactPath]).catch(() => ({ stdout: "", stderr: "" })); await run("launchctl", ["load", artifactPath]); }
    if (platform === "linux") await run("systemctl", ["--user", "restart", SYSTEMD_NAME]);
    if (platform === "win32") { await run("schtasks", ["/End", "/TN", WINDOWS_NAME]).catch(() => ({ stdout: "", stderr: "" })); await run("schtasks", ["/Run", "/TN", WINDOWS_NAME]); }
  }

  async function status(): Promise<ServiceStatus> {
    const installed = existsSync(artifactPath) && await owned(artifactPath);
    let running = false;
    let detail = installed ? "installed but supervisor is inactive" : "not installed";
    if (platform === "darwin") {
      const result = await run("launchctl", ["list"]).catch(() => ({ stdout: "", stderr: "" }));
      running = result.stdout.includes(SERVICE_LABEL);
    } else if (platform === "linux") {
      const result = await run("systemctl", ["--user", "is-active", SYSTEMD_NAME]).catch(() => ({ stdout: "", stderr: "" }));
      running = result.stdout.trim() === "active";
    } else if (platform === "win32") {
      const result = await run("schtasks", ["/Query", "/TN", WINDOWS_NAME, "/FO", "LIST"]).catch(() => ({ stdout: "", stderr: "" }));
      running = /status:\s*running/i.test(result.stdout);
    }
    if (running) detail = "supervisor active";
    return { platform, installed, running, stale: installed && !running, artifactPath, plistPath: artifactPath, logPath, detail };
  }

  return { install, uninstall, restart, stop, status, logs: (lines = 100) => tail(logPath, lines) };
}

const manager = () => createServiceManager();
export const installService = (repoRoot: string): Promise<string> => manager().install(repoRoot);
export const uninstallService = (): Promise<void> => manager().uninstall();
export const restartService = (): Promise<void> => manager().restart();
export const stopService = (): Promise<void> => manager().stop();
export const serviceStatus = (): Promise<ServiceStatus> => manager().status();
export const serviceLogs = (lines?: number): Promise<string> => manager().logs(lines);
