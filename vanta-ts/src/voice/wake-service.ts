import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export type WakeServiceState = {
  enabled: boolean;
  pid?: number;
  instanceId?: string;
  startedAt?: string;
  repoRoot?: string;
};

export type WakeServiceStatus = WakeServiceState & { running: boolean; statePath: string; logPath: string };

export function wakeStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "wake-word.json");
}

export function wakeLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "wake-word.log");
}

export async function readWakeState(env: NodeJS.ProcessEnv = process.env): Promise<WakeServiceState> {
  try {
    const parsed = JSON.parse(await readFile(wakeStatePath(env), "utf8")) as Partial<WakeServiceState>;
    return {
      enabled: parsed.enabled === true,
      ...(Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 1 ? { pid: Number(parsed.pid) } : {}),
      ...(typeof parsed.instanceId === "string" ? { instanceId: parsed.instanceId } : {}),
      ...(typeof parsed.startedAt === "string" ? { startedAt: parsed.startedAt } : {}),
      ...(typeof parsed.repoRoot === "string" ? { repoRoot: parsed.repoRoot } : {}),
    };
  } catch {
    return { enabled: false };
  }
}

async function writeWakeState(state: WakeServiceState, env: NodeJS.ProcessEnv): Promise<void> {
  const path = wakeStatePath(env);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

function realIsManaged(pid: number): boolean {
  try {
    process.kill(pid, 0);
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return /(?:run\.sh|src\/cli\.ts) voice wake listen/.test(command);
  } catch {
    return false;
  }
}

function realStart(repoRoot: string, logPath: string, instanceId: string): number {
  const runner = join(repoRoot, "run.sh");
  if (!existsSync(runner)) throw new Error(`Vanta runner not found: ${runner}`);
  const fd = openSync(logPath, "a", 0o600);
  try {
    const child = spawn(runner, ["voice", "wake", "listen"], {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, VANTA_WAKE_MANAGED: "1", VANTA_WAKE_INSTANCE: instanceId },
    });
    if (!child.pid) throw new Error("Wake listener did not start");
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

export type WakeServiceDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  isManaged?: (pid: number) => boolean;
  start?: (repoRoot: string, logPath: string, instanceId: string) => number;
  stop?: (pid: number) => void;
};

export async function wakeServiceStatus(deps: WakeServiceDeps = {}): Promise<WakeServiceStatus> {
  const env = deps.env ?? process.env;
  const state = await readWakeState(env);
  const running = !!state.pid && (deps.isManaged ?? realIsManaged)(state.pid);
  return { ...state, running, statePath: wakeStatePath(env), logPath: wakeLogPath(env) };
}

export async function enableWakeService(repoRoot: string, deps: WakeServiceDeps = {}): Promise<WakeServiceStatus> {
  const env = deps.env ?? process.env;
  const current = await wakeServiceStatus(deps);
  if (current.enabled && current.running) return current;
  const instanceId = randomUUID();
  const base: WakeServiceState = { enabled: true, instanceId, startedAt: (deps.now ?? (() => new Date()))().toISOString(), repoRoot };
  await writeWakeState(base, env);
  try {
    const pid = (deps.start ?? realStart)(repoRoot, wakeLogPath(env), instanceId);
    await writeWakeState({ ...base, pid }, env);
  } catch (error) {
    await writeWakeState({ enabled: false, repoRoot }, env);
    throw error;
  }
  return wakeServiceStatus({ ...deps, isManaged: deps.isManaged ?? (() => true) });
}

export async function disableWakeService(deps: WakeServiceDeps = {}): Promise<WakeServiceStatus> {
  const env = deps.env ?? process.env;
  const current = await wakeServiceStatus(deps);
  await writeWakeState({ enabled: false, repoRoot: current.repoRoot }, env);
  if (current.running && current.pid) {
    try {
      (deps.stop ?? ((pid) => process.kill(-pid, "SIGTERM")))(current.pid);
    } catch {
      // The state flag is authoritative; a managed listener also checks it each window.
    }
  }
  return { ...(await readWakeState(env)), running: false, statePath: wakeStatePath(env), logPath: wakeLogPath(env) };
}

export async function managedWakeEnabled(instanceId: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const state = await readWakeState(env);
  return state.enabled && state.instanceId === instanceId;
}
