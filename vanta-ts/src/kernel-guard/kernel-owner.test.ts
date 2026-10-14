import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findLiveKernelOwner } from "./kernel-owner.js";
import { kernelPidFilePath } from "./pid-file.js";

const homes: string[] = [];
const PORT = 18_456;

function homeWithPidFile(overrides: Record<string, unknown> = {}): string {
  const home = mkdtempSync(join(tmpdir(), "vanta-kernel-owner-"));
  homes.push(home);
  const path = kernelPidFilePath(home, PORT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    version: 1, kernelPid: 4242, guardPid: 4241, supervisorPid: 4000, port: PORT,
    root: "/tmp/project", kernelBin: "/opt/vanta-kernel", startedAt: "2026-10-14T10:00:00.000Z", ...overrides,
  }));
  return home;
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const alive = { isAlive: () => true, readCommand: () => `/opt/bin/vanta-kernel serve ${PORT}` };

describe("findLiveKernelOwner", () => {
  it("names the runtime that owns a live kernel on the port", () => {
    const owner = findLiveKernelOwner(homeWithPidFile(), PORT, alive);

    expect(owner).toMatchObject({ supervisorPid: 4000, kernelPid: 4242, guardPid: 4241 });
  });

  it("is null when the supervisor is gone (a stale file is not an owner)", () => {
    expect(findLiveKernelOwner(homeWithPidFile(), PORT, { ...alive, isAlive: () => false })).toBeNull();
  });

  it("is null when the recorded pid now runs something else (pid reuse)", () => {
    expect(findLiveKernelOwner(homeWithPidFile(), PORT, { ...alive, readCommand: () => "/usr/bin/vim notes.txt" })).toBeNull();
  });

  it("is null when the kernel is not running", () => {
    expect(findLiveKernelOwner(homeWithPidFile(), PORT, { ...alive, readCommand: () => null })).toBeNull();
  });

  it("is null when there is no pid file for the port", () => {
    expect(findLiveKernelOwner(homeWithPidFile(), PORT + 1, alive)).toBeNull();
  });
});
