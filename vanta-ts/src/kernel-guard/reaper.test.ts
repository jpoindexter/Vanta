import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { kernelPidFilePath } from "./pid-file.js";
import { reapStaleKernels, type ReapDeps } from "./reaper.js";

const PORT = 17_321;
const record = (over: Record<string, unknown> = {}) => ({
  version: 1, kernelPid: 5002, guardPid: 5001, supervisorPid: 5000, port: PORT,
  root: "/tmp/p", kernelBin: "/k/vanta-kernel", startedAt: "2026-10-14T10:00:00.000Z", ...over,
});

function profile(content: unknown) {
  const home = mkdtempSync(join(tmpdir(), "vanta-reap-"));
  mkdirSync(join(home, "run"));
  const file = kernelPidFilePath(home, PORT);
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  return { home, file };
}

function deps(over: Partial<ReapDeps> = {}) {
  const base: ReapDeps = {
    isAlive: vi.fn(() => false),
    readCommand: vi.fn((pid: number) => (pid === 5002 ? `/k/vanta-kernel serve ${PORT}` : null)),
    terminate: vi.fn(async () => true),
    removeFile: vi.fn(),
  };
  return { ...base, ...over };
}

describe("reapStaleKernels", () => {
  it("leaves a kernel alone while its supervisor is alive", async () => {
    const { home } = profile(record());
    const d = deps({ isAlive: vi.fn(() => true) });

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome?.action).toBe("skipped-live-supervisor");
    expect(d.terminate).not.toHaveBeenCalled();
    expect(d.removeFile).not.toHaveBeenCalled();
  });

  it("terminates a verified kernel whose supervisor is dead and removes the file", async () => {
    const { home, file } = profile(record());
    const d = deps();

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome).toMatchObject({ action: "reaped", kernelPid: 5002 });
    expect(d.terminate).toHaveBeenCalledWith(5002, expect.any(Number));
    expect(d.removeFile).toHaveBeenCalledWith(file);
  });

  it("refuses to signal a pid whose command is not the recorded kernel (pid reuse)", async () => {
    const { home } = profile(record());
    const d = deps({ readCommand: vi.fn(() => "/Applications/Safari.app/Contents/MacOS/Safari") });

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome).toMatchObject({ action: "refused" });
    expect(d.terminate).not.toHaveBeenCalled();
    expect(d.removeFile).toHaveBeenCalled();
  });

  it("refuses a kernel that now serves a different port", async () => {
    const { home } = profile(record());
    const d = deps({ readCommand: vi.fn(() => "/k/vanta-kernel serve 7788") });

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome?.action).toBe("refused");
    expect(d.terminate).not.toHaveBeenCalled();
  });

  it("only removes the file when the kernel already exited", async () => {
    const { home } = profile(record());
    const d = deps({ readCommand: vi.fn(() => null) });

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome).toMatchObject({ action: "removed-stale-file" });
    expect(d.terminate).not.toHaveBeenCalled();
  });

  it("also stops a surviving guard, but only when its command carries the guard marker and this file", async () => {
    const { home, file } = profile(record());
    const d = deps({
      readCommand: vi.fn((pid: number) => {
        if (pid === 5001) return `node -e src vanta-kernel-guard ${file} 5000 ${PORT}`;
        return pid === 5002 ? `/k/vanta-kernel serve ${PORT}` : null;
      }),
    });

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome).toMatchObject({ action: "reaped", guardKilled: true });
    expect(d.terminate).toHaveBeenCalledWith(5001, expect.any(Number));
  });

  it("removes a corrupt pid file without signalling anything", async () => {
    const { home } = profile("{broken");
    const d = deps();

    const [outcome] = await reapStaleKernels(home, d);

    expect(outcome).toMatchObject({ action: "removed-stale-file" });
    expect(d.terminate).not.toHaveBeenCalled();
  });

  it("does nothing for a profile without pid files and never reads another profile's run dir", async () => {
    const other = profile(record());
    const empty = mkdtempSync(join(tmpdir(), "vanta-reap-empty-"));
    const d = deps();

    expect(await reapStaleKernels(empty, d)).toEqual([]);
    expect(d.terminate).not.toHaveBeenCalled();
    expect(existsSync(other.file)).toBe(true);
  });
});
