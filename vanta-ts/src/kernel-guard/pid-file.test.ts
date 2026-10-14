import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isGuardCommand,
  isKernelCommand,
  kernelPidFilePath,
  listKernelPidFiles,
  parseKernelPidFile,
} from "./pid-file.js";

const valid = {
  version: 1,
  kernelPid: 4242,
  guardPid: 4241,
  supervisorPid: 4000,
  port: 17_123,
  root: "/tmp/project",
  kernelBin: "/opt/vanta/vanta-kernel",
  startedAt: "2026-10-14T10:00:00.000Z",
};

describe("parseKernelPidFile", () => {
  it("accepts a complete record", () => {
    const parsed = parseKernelPidFile(JSON.stringify(valid));
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  it("names the invalid field instead of guessing", () => {
    const parsed = parseKernelPidFile(JSON.stringify({ ...valid, kernelPid: -3 }));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toContain("kernelPid");
  });

  it("rejects non-JSON and unknown versions", () => {
    expect(parseKernelPidFile("not json")).toEqual({ ok: false, error: "pid file is not valid JSON" });
    expect(parseKernelPidFile(JSON.stringify({ ...valid, version: 2 })).ok).toBe(false);
  });

  it("rejects a pid that is a string, so a hand-edited file cannot smuggle in a target", () => {
    expect(parseKernelPidFile(JSON.stringify({ ...valid, kernelPid: "1; rm -rf /" })).ok).toBe(false);
  });
});

describe("isKernelCommand", () => {
  it("matches the exact serve command for the recorded port", () => {
    expect(isKernelCommand("/Applications/Vanta Next.app/Contents/Resources/kernel/vanta-kernel serve 17123", 17_123)).toBe(true);
    expect(isKernelCommand("vanta-kernel serve 17123", 17_123)).toBe(true);
  });

  it("refuses other ports, other binaries and look-alike names", () => {
    expect(isKernelCommand("/x/vanta-kernel serve 17124", 17_123)).toBe(false);
    expect(isKernelCommand("/x/vanta-kernel serve 171230", 17_123)).toBe(false);
    expect(isKernelCommand("/x/not-vanta-kernel serve 17123", 17_123)).toBe(false);
    expect(isKernelCommand("/usr/bin/vim vanta-kernel serve 17123", 17_123)).toBe(false);
    expect(isKernelCommand("/x/vanta-kernel status 17123", 17_123)).toBe(false);
  });
});

describe("isGuardCommand", () => {
  const pidFile = "/Users/me/.vanta/run/kernel-17123.json";

  it("matches a guard started for this pid file", () => {
    const command = `node -e (function(){}) vanta-kernel-guard ${pidFile} 4000 17123 /root /bin/vanta-kernel serve 17123`;
    expect(isGuardCommand(command, pidFile)).toBe(true);
  });

  it("refuses a guard for another pid file or a process without the marker", () => {
    expect(isGuardCommand(`node -e x vanta-kernel-guard /other/run/kernel-17123.json 1`, pidFile)).toBe(false);
    expect(isGuardCommand(`node server.js ${pidFile}`, pidFile)).toBe(false);
  });
});

describe("listKernelPidFiles", () => {
  it("lists only kernel-<port>.json files in this profile's run dir", () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-pidlist-"));
    mkdirSync(join(home, "run"));
    for (const name of ["kernel-17123.json", "kernel-x.json", "notes.txt", "kernel-17124.json.9"]) {
      writeFileSync(join(home, "run", name), "{}");
    }
    expect(listKernelPidFiles(home)).toEqual([kernelPidFilePath(home, 17_123)]);
  });

  it("returns nothing when the profile has no run dir", () => {
    expect(listKernelPidFiles(join(tmpdir(), "vanta-definitely-missing-home"))).toEqual([]);
  });
});
