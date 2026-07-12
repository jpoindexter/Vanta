import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, win32 } from "node:path";
import { promisify } from "node:util";
import { resolveVantaHome } from "../store/home.js";
import { buildLaunchdPlist } from "./launchd.js";
import { buildSystemdUnit, SERVICE_MARKER } from "./systemd.js";
import { buildTaskRunner, buildTaskXml } from "./windows.js";

export const SERVICE_LABEL = "studio.theft.vanta.gateway";
const SYSTEMD_NAME = "vanta-gateway.service";
const WINDOWS_NAME = "VantaGateway";
type Platform = NodeJS.Platform;
type ExecResult = { stdout: string; stderr: string };
type Exec = (file: string, args: string[]) => Promise<ExecResult>;
type Context = { platform: Platform; home: string; run: Exec; logPath: string; artifactPath: string; taskRunnerPath: string };
type ManagerOptions = { platform?: Platform; home?: string; vantaHome?: string; exec?: Exec };
const ignored: ExecResult = { stdout: "", stderr: "" };

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

function defaultExec(file: string, args: string[]): Promise<ExecResult> {
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

function artifactFor(platform: Platform, home: string, vantaHome: string): string {
  if (platform === "darwin") return join(home, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
  if (platform === "linux") return join(home, ".config", "systemd", "user", SYSTEMD_NAME);
  return join(vantaHome, "service", "vanta-gateway.xml");
}

function requireSupported(platform: Platform): void {
  if (!(["darwin", "linux", "win32"] as string[]).includes(platform)) {
    throw new Error(`Background service is not supported on ${platform}; run \`vanta gateway\` in the foreground.`);
  }
}

export function protectedMacServicePath(repoRoot: string, home: string): boolean {
  const target = resolve(repoRoot);
  return ["Documents", "Desktop", "Downloads"].some((folder) => {
    const rel = relative(resolve(home, folder), target);
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
  });
}

async function installLaunchd(ctx: Context, repoRoot: string): Promise<void> {
  const plist = buildLaunchdPlist({ label: SERVICE_LABEL, programArgs: [join(repoRoot, "run.sh"), "gateway"], workingDir: repoRoot, logPath: ctx.logPath, pathDirs: (process.env.PATH ?? "").split(":").filter(Boolean) });
  await writeFile(ctx.artifactPath, plist.replace("<plist version=\"1.0\">", `<plist version=\"1.0\">\n<!-- ${SERVICE_MARKER} -->`), "utf8");
  await ctx.run("launchctl", ["unload", ctx.artifactPath]).catch(() => ignored);
  await ctx.run("launchctl", ["load", ctx.artifactPath]);
}

async function installSystemd(ctx: Context, repoRoot: string): Promise<void> {
  const unit = buildSystemdUnit({ command: join(repoRoot, "run.sh"), args: ["gateway"], workingDir: repoRoot, logPath: ctx.logPath });
  await writeFile(ctx.artifactPath, unit, "utf8");
  await ctx.run("systemctl", ["--user", "daemon-reload"]);
  await ctx.run("systemctl", ["--user", "enable", "--now", SYSTEMD_NAME]);
}

async function installTask(ctx: Context, repoRoot: string): Promise<void> {
  const command = win32.join(repoRoot, "run.ps1");
  const runner = buildTaskRunner({ command, args: ["gateway"], logPath: ctx.logPath });
  const identity = await ctx.run("whoami", ["/user", "/fo", "csv", "/nh"]), userId = identity.stdout.match(/S-\d(?:-\d+)+/)?.[0];
  if (!userId) throw new Error("Could not resolve the current Windows user SID for Task Scheduler.");
  const xml = buildTaskXml({ runnerPath: ctx.taskRunnerPath, workingDir: repoRoot, userId });
  await writeFile(ctx.taskRunnerPath, runner, "utf8");
  await writeFile(ctx.artifactPath, `\uFEFF${xml}`, "utf16le");
  await ctx.run("schtasks", ["/Create", "/TN", WINDOWS_NAME, "/XML", ctx.artifactPath, "/F"]);
  await ctx.run("schtasks", ["/Run", "/TN", WINDOWS_NAME]);
}

async function install(ctx: Context, repoRoot: string): Promise<string> {
  requireSupported(ctx.platform);
  if (ctx.platform === "darwin" && protectedMacServicePath(repoRoot, ctx.home)) {
    throw new Error("macOS blocks launchd access to protected folders. Install Vanta outside Documents/Desktop/Downloads (recommended: ~/vanta), then run `vanta service install` there.");
  }
  await mkdir(dirname(ctx.artifactPath), { recursive: true });
  await mkdir(dirname(ctx.logPath), { recursive: true });
  if (ctx.platform === "darwin") await installLaunchd(ctx, repoRoot);
  if (ctx.platform === "linux") await installSystemd(ctx, repoRoot);
  if (ctx.platform === "win32") await installTask(ctx, repoRoot);
  return ctx.artifactPath;
}

async function assertOwnedArtifacts(ctx: Context): Promise<void> {
  if (!(await owned(ctx.artifactPath))) throw new Error(`Refusing to remove ${ctx.artifactPath}: artifact is not Vanta-owned.`);
  const runnerNeedsCheck = ctx.platform === "win32" && existsSync(ctx.taskRunnerPath);
  if (runnerNeedsCheck && !(await owned(ctx.taskRunnerPath))) {
    throw new Error(`Refusing to remove ${ctx.taskRunnerPath}: artifact is not Vanta-owned.`);
  }
}

async function uninstall(ctx: Context): Promise<void> {
  requireSupported(ctx.platform);
  if (!existsSync(ctx.artifactPath)) return;
  await assertOwnedArtifacts(ctx);
  if (ctx.platform === "darwin") await ctx.run("launchctl", ["unload", ctx.artifactPath]).catch(() => ignored);
  if (ctx.platform === "linux") await ctx.run("systemctl", ["--user", "disable", "--now", SYSTEMD_NAME]).catch(() => ignored);
  if (ctx.platform === "win32") await ctx.run("schtasks", ["/Delete", "/TN", WINDOWS_NAME, "/F"]).catch(() => ignored);
  await rm(ctx.artifactPath, { force: true });
  if (ctx.platform === "win32") await rm(ctx.taskRunnerPath, { force: true });
  if (ctx.platform === "linux") await ctx.run("systemctl", ["--user", "daemon-reload"]);
}

async function stop(ctx: Context): Promise<void> {
  requireSupported(ctx.platform);
  if (ctx.platform === "darwin") await ctx.run("launchctl", ["unload", ctx.artifactPath]);
  if (ctx.platform === "linux") await ctx.run("systemctl", ["--user", "stop", SYSTEMD_NAME]);
  if (ctx.platform === "win32") await ctx.run("schtasks", ["/End", "/TN", WINDOWS_NAME]);
}

async function restart(ctx: Context): Promise<void> {
  requireSupported(ctx.platform);
  if (!existsSync(ctx.artifactPath)) throw new Error("Service is not installed. Run `vanta up` first.");
  if (ctx.platform === "darwin") { await ctx.run("launchctl", ["unload", ctx.artifactPath]).catch(() => ignored); await ctx.run("launchctl", ["load", ctx.artifactPath]); }
  if (ctx.platform === "linux") await ctx.run("systemctl", ["--user", "restart", SYSTEMD_NAME]);
  if (ctx.platform === "win32") { await ctx.run("schtasks", ["/End", "/TN", WINDOWS_NAME]).catch(() => ignored); await ctx.run("schtasks", ["/Run", "/TN", WINDOWS_NAME]); }
}

async function runningState(ctx: Context): Promise<{ running: boolean; detail?: string }> {
  if (ctx.platform === "darwin") {
    const result = await ctx.run("launchctl", ["list"]).catch(() => ignored);
    return { running: result.stdout.includes(SERVICE_LABEL) };
  }
  if (ctx.platform === "linux") {
    const active = await ctx.run("systemctl", ["--user", "is-active", SYSTEMD_NAME]).catch(() => ignored);
    const state = await ctx.run("systemctl", ["--user", "show", SYSTEMD_NAME, "--property=ActiveState,SubState,Result,ExecMainStatus"]).catch(() => ignored);
    return { running: active.stdout.trim() === "active", detail: state.stdout.trim().replaceAll("\n", " · ") || undefined };
  }
  const result = await ctx.run("schtasks", ["/Query", "/TN", WINDOWS_NAME, "/FO", "LIST", "/V"]).catch(() => ignored);
  const detail = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(status|last run time|last result|task to run|scheduled task state|logon mode):/i.test(line))
    .join(" · ")
    .slice(0, 1200);
  return { running: /status:\s*running/i.test(result.stdout), detail: detail || undefined };
}

async function status(ctx: Context): Promise<ServiceStatus> {
  const installed = existsSync(ctx.artifactPath) && await owned(ctx.artifactPath);
  const state = await runningState(ctx);
  const detail = state.running ? state.detail ?? "supervisor active" : state.detail ?? (installed ? "installed but supervisor is inactive" : "not installed");
  return { platform: ctx.platform, installed, running: state.running, stale: installed && !state.running, artifactPath: ctx.artifactPath, plistPath: ctx.artifactPath, logPath: ctx.logPath, detail };
}

export function createServiceManager(options: ManagerOptions = {}): ServiceManager {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const vantaHome = options.vantaHome ?? resolveVantaHome();
  const ctx = { platform, home, run: options.exec ?? defaultExec, logPath: join(vantaHome, "gateway.log"), artifactPath: artifactFor(platform, home, vantaHome), taskRunnerPath: join(vantaHome, "service", "vanta-gateway-runner.ps1") };
  return {
    install: (repoRoot) => install(ctx, repoRoot),
    uninstall: () => uninstall(ctx), restart: () => restart(ctx), stop: () => stop(ctx),
    status: () => status(ctx), logs: (lines = 100) => tail(ctx.logPath, lines),
  };
}

const manager = () => createServiceManager();
export const installService = (repoRoot: string): Promise<string> => manager().install(repoRoot);
export const uninstallService = (): Promise<void> => manager().uninstall();
export const restartService = (): Promise<void> => manager().restart();
export const stopService = (): Promise<void> => manager().stop();
export const serviceStatus = (): Promise<ServiceStatus> => manager().status();
export const serviceLogs = (lines?: number): Promise<string> => manager().logs(lines);
