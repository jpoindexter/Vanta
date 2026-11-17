import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isKernelCommand, kernelPidFilePath, readKernelPidFile } from "./pid-file.js";
import { isProcessAlive } from "./process-ops.js";

const here = dirname(fileURLToPath(import.meta.url));
const tsRoot = resolve(here, "..", "..");
const kernelBin = process.env.VANTA_KERNEL_BIN ?? resolve(tsRoot, "..", "target", "debug", "vanta-kernel");
const loader = pathToFileURL(join(tsRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;
const fixture = join(here, "__fixtures__", "guarded-supervisor.ts");
const available = existsSync(kernelBin) && existsSync(join(tsRoot, "node_modules", "tsx"));

const started = new Set<number>();
const homes: string[] = [];

type Runtime = { child: ChildProcess; ready: Promise<void>; log: () => string };

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => ok(port));
    });
  });
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(100);
  }
  return check();
}

function newProfile(): { home: string; root: string } {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "vanta-two-rt-")));
  homes.push(home);
  mkdirSync(join(home, ".vanta"), { recursive: true });
  const root = join(home, "project");
  mkdirSync(root);
  return { home, root };
}

/** A real runtime start (the `vanta desktop` bootstrap path) on a shared profile and port. */
function startRuntime(profile: { home: string; root: string }, port: number): Runtime {
  const env = { ...process.env, HOME: profile.home, VANTA_HOME: join(profile.home, ".vanta"), VANTA_KERNEL_BIN: kernelBin };
  const child = spawn(process.execPath, ["--import", loader, fixture, String(port), kernelBin, profile.root], {
    cwd: tsRoot, env, stdio: ["ignore", "pipe", "pipe"],
  });
  started.add(child.pid as number);
  let out = "";
  child.stdout?.on("data", (chunk: Buffer) => { out += String(chunk); });
  child.stderr?.on("data", (chunk: Buffer) => { out += String(chunk); });
  const ready = new Promise<void>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`runtime ${child.pid} never became ready:\n${out}`)), 40_000);
    const poll = setInterval(() => {
      if (out.includes("ready ")) { clearInterval(poll); clearTimeout(timer); ok(); }
    }, 50);
    child.once("exit", () => {
      clearInterval(poll);
      if (!out.includes("ready ")) { clearTimeout(timer); fail(new Error(`runtime ${child.pid} exited before ready:\n${out}`)); }
    });
  });
  return { child, ready, log: () => out };
}

/** Live `vanta-kernel serve <port>` processes (not the guard, whose argv also ends with the same words). */
function kernelProcesses(port: number): number[] {
  const out = execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" });
  return out.split("\n").flatMap((line) => {
    const m = line.trim().match(/^(?<pid>\d+)\s+(?<command>.*)$/);
    const { pid, command } = m?.groups ?? {};
    return pid && command && !command.includes("vanta-kernel-guard") && isKernelCommand(command, port) ? [Number(pid)] : [];
  });
}

afterEach(() => {
  for (const pid of started) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  started.clear();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function remember(pidFile: string): Promise<{ supervisorPid: number; kernelPid: number; guardPid: number }> {
  expect(await until(() => existsSync(pidFile), 5000)).toBe(true);
  const read = readKernelPidFile(pidFile);
  if (!read.ok) throw new Error(read.error);
  started.add(read.value.kernelPid);
  started.add(read.value.guardPid);
  return read.value;
}

describe.skipIf(!available)(`two runtimes sharing one profile and kernel port (${kernelBin})`, () => {
  it("start together: exactly one kernel, both attach, the loser's death leaves the winner's kernel alone, the winner's death ends it", async () => {
    const profile = newProfile();
    const port = await freePort();
    const pidFile = kernelPidFilePath(join(profile.home, ".vanta"), port);
    const first = startRuntime(profile, port);
    const second = startRuntime(profile, port);

    await Promise.all([first.ready, second.ready]);
    const owner = await remember(pidFile);

    expect(kernelProcesses(port)).toEqual([owner.kernelPid]);
    const runtimes = [first, second];
    const winner = runtimes.find((r) => r.child.pid === owner.supervisorPid);
    const loser = runtimes.find((r) => r.child.pid !== owner.supervisorPid);
    expect(winner, "the pid file names one of the two runtimes as owner").toBeDefined();

    process.kill(loser?.child.pid as number, "SIGKILL");
    await sleep(3500);
    expect(isProcessAlive(owner.kernelPid)).toBe(true);
    expect(JSON.parse(readFileSync(pidFile, "utf8")).kernelPid).toBe(owner.kernelPid);

    process.kill(winner?.child.pid as number, "SIGTERM");
    expect(await until(() => !isProcessAlive(owner.kernelPid) && !isProcessAlive(owner.guardPid), 6000)).toBe(true);
    expect(await until(() => !existsSync(pidFile), 2000)).toBe(true);
    expect(kernelProcesses(port)).toEqual([]);
  }, 90_000);

  it("a runtime that starts later attaches to the live kernel and leaves its pid file untouched", async () => {
    const profile = newProfile();
    const port = await freePort();
    const pidFile = kernelPidFilePath(join(profile.home, ".vanta"), port);
    const first = startRuntime(profile, port);
    await first.ready;
    const before = readFileSync(pidFile, "utf8");
    const owner = await remember(pidFile);

    const late = startRuntime(profile, port);
    await late.ready;

    expect(kernelProcesses(port)).toEqual([owner.kernelPid]);
    expect(readFileSync(pidFile, "utf8")).toBe(before);
    expect(late.log()).toContain(`owned by runtime pid ${first.child.pid}`);
    process.kill(late.child.pid as number, "SIGTERM");
    await sleep(2500);
    expect(isProcessAlive(owner.kernelPid)).toBe(true);
  }, 90_000);
});

describe.runIf(!available)("two runtimes sharing one profile", () => {
  it.skip(`skipped: no kernel binary at ${kernelBin} (build it or set VANTA_KERNEL_BIN)`, () => undefined);
});
