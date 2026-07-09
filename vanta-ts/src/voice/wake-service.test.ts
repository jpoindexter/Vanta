import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  disableWakeService,
  enableWakeService,
  managedWakeEnabled,
  readWakeState,
  wakeServiceStatus,
} from "./wake-service.js";

async function testEnv(): Promise<NodeJS.ProcessEnv> {
  return { ...process.env, VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-wake-state-")) };
}

describe("wake service lifecycle", () => {
  it("is opt-in, starts once, and disables the managed process", async () => {
    const env = await testEnv();
    const start = vi.fn(() => 4242);
    const stop = vi.fn();
    const isManaged = vi.fn((pid: number) => pid === 4242);
    expect((await wakeServiceStatus({ env, isManaged })).enabled).toBe(false);

    const enabled = await enableWakeService("/repo", { env, start, stop, isManaged, now: () => new Date("2026-07-10T00:00:00.000Z") });
    expect(enabled).toMatchObject({ enabled: true, running: true, pid: 4242, repoRoot: "/repo" });
    expect(start).toHaveBeenCalledOnce();
    expect(await managedWakeEnabled(enabled.instanceId ?? "", env)).toBe(true);

    await enableWakeService("/repo", { env, start, stop, isManaged });
    expect(start).toHaveBeenCalledOnce();
    const disabled = await disableWakeService({ env, start, stop, isManaged });
    expect(stop).toHaveBeenCalledWith(4242);
    expect(disabled).toMatchObject({ enabled: false, running: false });
    expect(await managedWakeEnabled(enabled.instanceId ?? "", env)).toBe(false);
  });

  it("restarts stale state instead of claiming the listener is running", async () => {
    const env = await testEnv();
    const start = vi.fn(() => 2222);
    await enableWakeService("/repo", { env, start: () => 1111, isManaged: () => true });
    const restarted = await enableWakeService("/repo", { env, start, isManaged: (pid) => pid === 2222 });
    expect(start).toHaveBeenCalledOnce();
    expect(restarted.pid).toBe(2222);
  });

  it("rolls the opt-in flag back when process start fails", async () => {
    const env = await testEnv();
    await expect(enableWakeService("/repo", { env, start: () => { throw new Error("spawn failed"); }, isManaged: () => false }))
      .rejects.toThrow("spawn failed");
    expect(await readWakeState(env)).toEqual({ enabled: false, repoRoot: "/repo" });
  });
});
