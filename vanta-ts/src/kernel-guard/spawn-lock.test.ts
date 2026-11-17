import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listKernelPidFiles } from "./pid-file.js";
import { acquireSpawnLock, kernelSpawnLockPath, SPAWN_LOCK_MAX_AGE_MS } from "./spawn-lock.js";

const homes: string[] = [];
const PORT = 18_123;

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "vanta-spawn-lock-"));
  homes.push(home);
  return home;
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function writeLock(home: string, lock: Record<string, unknown>): string {
  const path = kernelSpawnLockPath(home, PORT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: 1, port: PORT, token: "other", startedAt: new Date().toISOString(), ...lock }));
  return path;
}

describe("acquireSpawnLock", () => {
  it("is exclusive: the second caller is told who holds it and does not take it", () => {
    const home = makeHome();
    const first = acquireSpawnLock(home, PORT, { pid: 111, isAlive: () => true });
    const second = acquireSpawnLock(home, PORT, { pid: 222, isAlive: () => true });

    expect(first.kind).toBe("acquired");
    expect(second).toMatchObject({ kind: "held", holderPid: 111 });
  });

  it("is per port", () => {
    const home = makeHome();
    acquireSpawnLock(home, PORT, { pid: 111, isAlive: () => true });

    expect(acquireSpawnLock(home, PORT + 1, { pid: 222, isAlive: () => true }).kind).toBe("acquired");
  });

  it("lets the next runtime in after the holder releases", () => {
    const home = makeHome();
    const first = acquireSpawnLock(home, PORT, { pid: 111, isAlive: () => true });
    if (first.kind === "acquired") first.release();

    expect(existsSync(kernelSpawnLockPath(home, PORT))).toBe(false);
    expect(acquireSpawnLock(home, PORT, { pid: 222, isAlive: () => true }).kind).toBe("acquired");
  });

  it("replaces a lock whose holder died", () => {
    const home = makeHome();
    const path = writeLock(home, { pid: 999_999 });

    const result = acquireSpawnLock(home, PORT, { pid: 222, isAlive: (pid) => pid !== 999_999 });

    expect(result.kind).toBe("acquired");
    expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(222);
  });

  it("replaces an unreadable lock", () => {
    const home = makeHome();
    const path = kernelSpawnLockPath(home, PORT);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not json");

    expect(acquireSpawnLock(home, PORT, { pid: 222, isAlive: () => true }).kind).toBe("acquired");
  });

  it("replaces a lock older than the start window even when its pid is alive (pid reuse)", () => {
    const home = makeHome();
    const old = new Date(Date.now() - SPAWN_LOCK_MAX_AGE_MS - 1000).toISOString();
    writeLock(home, { pid: 111, startedAt: old });

    expect(acquireSpawnLock(home, PORT, { pid: 222, isAlive: () => true }).kind).toBe("acquired");
  });

  it("release never removes a lock that a newer holder took over", () => {
    const home = makeHome();
    const mine = acquireSpawnLock(home, PORT, { pid: 111, isAlive: () => true });
    const path = writeLock(home, { pid: 333, token: "newer-holder" });

    if (mine.kind === "acquired") mine.release();

    expect(JSON.parse(readFileSync(path, "utf8")).token).toBe("newer-holder");
  });

  it("is not mistaken for a kernel pid file by the reaper", () => {
    const home = makeHome();
    acquireSpawnLock(home, PORT, { pid: 111, isAlive: () => true });

    expect(listKernelPidFiles(home)).toEqual([]);
  });
});
