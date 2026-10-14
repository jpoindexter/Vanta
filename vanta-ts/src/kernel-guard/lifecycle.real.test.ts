import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { kernelPidFilePath, readKernelPidFile, type KernelPidFile } from "./pid-file.js";
import { isProcessAlive } from "./process-ops.js";
import { reapStaleKernels } from "./reaper.js";

const here = dirname(fileURLToPath(import.meta.url));
const tsRoot = resolve(here, "..", "..");
const kernelBin = process.env.VANTA_KERNEL_BIN ?? resolve(tsRoot, "..", "target", "debug", "vanta-kernel");
const loader = pathToFileURL(join(tsRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;
const fixture = join(here, "__fixtures__", "guarded-supervisor.ts");
const available = existsSync(kernelBin) && existsSync(join(tsRoot, "node_modules", "tsx"));
const SETTLE_MS = 5000;

// Every pid started by a test; the only processes cleanup may signal.
const started = new Set<number>();
const homes: string[] = [];

type Run = { home: string; port: number; supervisor: ChildProcess; entry: KernelPidFile; pidFile: string };

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

function supervisorEnv(home: string, extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, VANTA_HOME: join(home, ".vanta"), VANTA_KERNEL_BIN: kernelBin, ...extra };
}

async function startSupervisor(extra: NodeJS.ProcessEnv = {}, bin = kernelBin): Promise<Run> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "vanta-kl-real-")));
  homes.push(home);
  mkdirSync(join(home, ".vanta"), { recursive: true });
  const root = join(home, "project");
  mkdirSync(root);
  const port = await freePort();
  const args = ["--import", loader, fixture, String(port), bin, root];
  const supervisor = spawn(process.execPath, args, { cwd: tsRoot, env: supervisorEnv(home, extra), stdio: ["ignore", "pipe", "pipe"] });
  if (supervisor.pid) started.add(supervisor.pid);
  return awaitReady({ home, port, supervisor });
}

async function awaitReady(base: { home: string; port: number; supervisor: ChildProcess }): Promise<Run> {
  const pidFile = kernelPidFilePath(join(base.home, ".vanta"), base.port);
  const ok = await until(() => existsSync(pidFile), 25_000);
  if (!ok) throw new Error(`kernel never started (no ${pidFile})`);
  const read = readKernelPidFile(pidFile);
  if (!read.ok) throw new Error(read.error);
  for (const pid of [read.value.guardPid, read.value.kernelPid]) started.add(pid);
  return { ...base, entry: read.value, pidFile };
}

afterEach(() => {
  for (const pid of started) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  started.clear();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function expectAllGone(run: Run): Promise<void> {
  const pids = [run.entry.kernelPid, run.entry.guardPid];
  const gone = await until(() => pids.every((pid) => !isProcessAlive(pid)), SETTLE_MS);
  expect({ kernelAlive: isProcessAlive(run.entry.kernelPid), guardAlive: isProcessAlive(run.entry.guardPid), gone }).toEqual({
    kernelAlive: false, guardAlive: false, gone: true,
  });
  expect(await until(() => !existsSync(run.pidFile), 2000)).toBe(true);
}

describe.skipIf(!available)(`kernel lifecycle with the real kernel (${kernelBin})`, () => {
  it.each(["SIGTERM", "SIGINT", "SIGHUP", "SIGKILL"] as const)(
    "the kernel dies within 5s when its supervisor gets %s",
    async (signal) => {
      const run = await startSupervisor();
      expect(isProcessAlive(run.entry.kernelPid)).toBe(true);

      process.kill(run.supervisor.pid as number, signal);

      await expectAllGone(run);
    },
    40_000,
  );

  it("the supervisor and kernel die when the process that launched the supervisor is SIGKILLed", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "vanta-kl-real-")));
    homes.push(home);
    mkdirSync(join(home, ".vanta"), { recursive: true });
    const root = join(home, "project");
    mkdirSync(root);
    const port = await freePort();
    const wrapperSource = `
      const { spawn } = require("node:child_process");
      const c = spawn(process.execPath, JSON.parse(process.env.KL_ARGV), { stdio: "ignore", env: process.env });
      process.stdout.write(c.pid + "\\n"); setInterval(() => {}, 1000);`;
    const env = supervisorEnv(home, { VANTA_DESKTOP_PARENT_WATCH: "1" });
    const argv = ["--import", loader, fixture, String(port), kernelBin, root];
    const wrapper = spawn(process.execPath, ["-e", wrapperSource], { env: { ...env, KL_ARGV: JSON.stringify(argv) }, stdio: ["ignore", "pipe", "ignore"] });
    started.add(wrapper.pid as number);
    const supervisorPid = Number(await new Promise<string>((ok) => wrapper.stdout?.once("data", (d: Buffer) => ok(String(d).trim()))));
    started.add(supervisorPid);
    const run = await awaitReady({ home, port, supervisor: wrapper });

    process.kill(wrapper.pid as number, "SIGKILL");

    expect(await until(() => !isProcessAlive(supervisorPid), SETTLE_MS)).toBe(true);
    await expectAllGone(run);
  }, 40_000);

  it("the reaper retires a kernel orphaned by a supervisor AND guard that were both SIGKILLed", async () => {
    const run = await startSupervisor();
    process.kill(run.entry.guardPid, "SIGKILL");
    process.kill(run.supervisor.pid as number, "SIGKILL");
    expect(await until(() => !isProcessAlive(run.supervisor.pid as number), 3000)).toBe(true);
    expect(isProcessAlive(run.entry.kernelPid)).toBe(true);

    const outcomes = await reapStaleKernels(join(run.home, ".vanta"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ action: "reaped", kernelPid: run.entry.kernelPid });
    expect(isProcessAlive(run.entry.kernelPid)).toBe(false);
    expect(existsSync(run.pidFile)).toBe(false);
  }, 40_000);

  it("waits for a kernel that takes 6s to start (the old single 5s window would have failed)", async () => {
    const shimDir = realpathSync(mkdtempSync(join(tmpdir(), "vanta-kl-shim-")));
    homes.push(shimDir);
    const shim = join(shimDir, "vanta-kernel");
    writeFileSync(shim, `#!/bin/sh\nsleep 6\nexec "${kernelBin}" "$@"\n`);
    chmodSync(shim, 0o755);

    const begun = Date.now();
    const run = await startSupervisor({}, shim);
    let output = "";
    run.supervisor.stdout?.on("data", (chunk: Buffer) => { output += String(chunk); });

    expect(await until(() => output.includes("ready "), 20_000)).toBe(true);
    expect(Date.now() - begun).toBeGreaterThanOrEqual(5500);
    expect(isProcessAlive(run.entry.kernelPid)).toBe(true);
    process.kill(run.supervisor.pid as number, "SIGTERM");
    await expectAllGone(run);
  }, 60_000);

  it("a live supervisor's kernel is never reaped", async () => {
    const run = await startSupervisor();

    const outcomes = await reapStaleKernels(join(run.home, ".vanta"));

    expect(outcomes[0]).toMatchObject({ action: "skipped-live-supervisor" });
    expect(isProcessAlive(run.entry.kernelPid)).toBe(true);
  }, 40_000);
});

describe.runIf(!available)("kernel lifecycle with the real kernel", () => {
  it.skip(`skipped: no kernel binary at ${kernelBin} (build it or set VANTA_KERNEL_BIN)`, () => undefined);
});
