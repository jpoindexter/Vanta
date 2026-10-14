import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureKernel } from "./kernel-launcher.js";
import { kernelPidFilePath } from "./kernel-guard/pid-file.js";
import { kernelSpawnLockPath } from "./kernel-guard/spawn-lock.js";

const PORT = 18_789;
const URL_ = `http://127.0.0.1:${PORT}`;
const children: ChildProcess[] = [];
let home: string;
const savedHome = process.env.VANTA_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-launcher-lock-"));
  process.env.VANTA_HOME = home;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const child of children.splice(0)) child.kill("SIGKILL");
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = savedHome;
});

/** A live process that is not this one: stands in for another runtime. */
function otherRuntime(): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(child);
  return child.pid as number;
}

function stubStatus(readyAfter: number | null, root: string): { calls: () => number } {
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls += 1;
    const ready = readyAfter !== null && calls > readyAfter;
    return { ok: ready, json: async () => ({ status: "ready", root }) };
  }));
  return { calls: () => calls };
}

function writeFileAt(path: string, body: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(body));
}

describe("ensureKernel with another runtime on the same profile and port", () => {
  it("waits for the runtime that is starting the kernel, attaches, and starts nothing", async () => {
    const root = join(home, "project");
    const holder = otherRuntime();
    const lockPath = kernelSpawnLockPath(home, PORT);
    writeFileAt(lockPath, { version: 1, pid: holder, token: "winner", port: PORT, startedAt: new Date().toISOString() });
    stubStatus(3, root);

    const url = await ensureKernel({ baseUrl: URL_, kernelBin: process.execPath, root, ephemeral: true });

    expect(url).toBe(URL_);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).token).toBe("winner");
    expect(existsSync(kernelPidFilePath(home, PORT))).toBe(false);
  });

  it("fails fast with who holds the start and what to do when it never becomes ready", async () => {
    const holder = otherRuntime();
    writeFileAt(kernelSpawnLockPath(home, PORT), { version: 1, pid: holder, token: "winner", port: PORT, startedAt: new Date().toISOString() });
    stubStatus(null, join(home, "project"));

    const attempt = ensureKernel({ baseUrl: URL_, kernelBin: process.execPath, root: join(home, "project"), ephemeral: true, startLockWaitMs: 400 });

    await expect(attempt).rejects.toThrow(new RegExp(`pid ${holder}.*VANTA_KERNEL_URL`));
  });

  it("refuses to start a second kernel when a live runtime owns an unresponsive one, and leaves its pid file alone", async () => {
    const shimDir = mkdtempSync(join(tmpdir(), "vanta-launcher-shim-"));
    const shim = join(shimDir, "vanta-kernel");
    writeFileSync(shim, "#!/bin/sh\nsleep 60 &\nwait\n");
    chmodSync(shim, 0o755);
    const kernel = spawn(shim, ["serve", String(PORT)], { stdio: "ignore" });
    children.push(kernel);
    const supervisor = otherRuntime();
    const pidFile = kernelPidFilePath(home, PORT);
    const record = {
      version: 1, kernelPid: kernel.pid, guardPid: supervisor, supervisorPid: supervisor, port: PORT,
      root: join(home, "project"), kernelBin: shim, startedAt: new Date().toISOString(),
    };
    writeFileAt(pidFile, record);
    stubStatus(null, join(home, "project"));

    try {
      await expect(ensureKernel({ baseUrl: URL_, kernelBin: shim, root: join(home, "project"), ephemeral: true }))
        .rejects.toThrow(new RegExp(`belongs to the Vanta runtime with pid ${supervisor}.*Not starting a second one`));

      expect(JSON.parse(readFileSync(pidFile, "utf8"))).toEqual(record);
      expect(() => process.kill(kernel.pid as number, 0)).not.toThrow();
      expect(existsSync(kernelSpawnLockPath(home, PORT))).toBe(false);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it("takes over a start lock left by a runtime that died, and releases it when the start fails", async () => {
    const root = join(home, "project");
    mkdirSync(root);
    const shim = join(home, "vanta-kernel");
    writeFileSync(shim, "#!/bin/sh\nexit 3\n");
    chmodSync(shim, 0o755);
    const lockPath = kernelSpawnLockPath(home, PORT);
    writeFileAt(lockPath, { version: 1, pid: 999_999, token: "dead", port: PORT, startedAt: new Date().toISOString() });
    stubStatus(null, root);

    // Reaching the spawn step (the kernel exits at once) proves the dead holder's lock was replaced, not waited on.
    const attempt = ensureKernel({ baseUrl: URL_, kernelBin: shim, root, ephemeral: true, startLockWaitMs: 400 });

    await expect(attempt).rejects.toThrow(/vanta-kernel exited/);
    expect(existsSync(lockPath)).toBe(false);
  });
});
