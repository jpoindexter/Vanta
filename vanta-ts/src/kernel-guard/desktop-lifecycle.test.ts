import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDesktopKernelLifecycle,
  KERNEL_EPHEMERAL_ENV,
  PARENT_WATCH_ENV,
  resetDesktopKernelLifecycleForTests,
} from "./desktop-lifecycle.js";

const mkDeps = () => ({
  reap: vi.fn(async () => []),
  watch: vi.fn(() => () => undefined),
  signalSelf: vi.fn(),
  log: vi.fn(),
});

beforeEach(() => resetDesktopKernelLifecycleForTests());

describe("applyDesktopKernelLifecycle", () => {
  it("makes the kernel runtime-owned by default and reaps this profile only", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_HOME: "/tmp/profile-a" };
    const deps = mkDeps();

    await applyDesktopKernelLifecycle(env, deps);

    expect(env[KERNEL_EPHEMERAL_ENV]).toBe("1");
    expect(deps.reap).toHaveBeenCalledWith("/tmp/profile-a");
  });

  it("keeps an explicit opt-out to the shared detached kernel", async () => {
    const env: NodeJS.ProcessEnv = { [KERNEL_EPHEMERAL_ENV]: "0" };

    await applyDesktopKernelLifecycle(env, mkDeps());

    expect(env[KERNEL_EPHEMERAL_ENV]).toBe("0");
  });

  it("watches the launching shell only when the shell asked for it, and signals itself when orphaned", async () => {
    const deps = mkDeps();
    await applyDesktopKernelLifecycle({}, deps);
    expect(deps.watch).not.toHaveBeenCalled();

    resetDesktopKernelLifecycleForTests();
    const watched = mkDeps();
    await applyDesktopKernelLifecycle({ [PARENT_WATCH_ENV]: "1" }, watched);
    expect(watched.watch).toHaveBeenCalledOnce();
    const onOrphaned = (watched.watch.mock.calls[0] as unknown as [() => void])[0];
    onOrphaned();

    expect(watched.signalSelf).toHaveBeenCalledOnce();
  });

  it("still starts when the reaper throws, and logs why", async () => {
    const deps = mkDeps();
    deps.reap.mockRejectedValueOnce(new Error("ps unavailable"));
    const env: NodeJS.ProcessEnv = { [PARENT_WATCH_ENV]: "1" };

    await applyDesktopKernelLifecycle(env, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("ps unavailable"));
    expect(deps.watch).toHaveBeenCalledOnce();
  });

  it("is idempotent", async () => {
    const deps = mkDeps();
    await applyDesktopKernelLifecycle({}, deps);
    await applyDesktopKernelLifecycle({}, deps);

    expect(deps.reap).toHaveBeenCalledOnce();
  });
});
