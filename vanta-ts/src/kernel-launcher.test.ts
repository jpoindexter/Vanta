import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  registerKernelCleanup,
  resolveRootScopedKernelUrl,
  rootScopedKernelPort,
} from "./kernel-launcher.js";

describe("rootScopedKernelPort", () => {
  it("is stable for one project and separates distinct projects from the default endpoint", () => {
    const first = rootScopedKernelPort("/tmp/vanta-project-one");
    expect(first).toBe(rootScopedKernelPort("/tmp/vanta-project-one"));
    expect(first).not.toBe(7788);
    expect(first).toBeGreaterThanOrEqual(17_000);
    expect(first).toBeLessThan(21_000);
    expect(rootScopedKernelPort("/tmp/vanta-project-two")).not.toBe(first);
  });

  it("moves to the next scoped endpoint when the preferred port belongs to another project", async () => {
    const root = "/tmp/vanta-current-project";
    const preferred = rootScopedKernelPort(root);
    const checked: string[] = [];
    const resolved = await resolveRootScopedKernelUrl(root, async (url) => {
      checked.push(url);
      return url.endsWith(`:${preferred}`)
        ? { status: "ready", root: "/tmp/vanta-other-project" }
        : null;
    });

    expect(checked).toHaveLength(2);
    expect(resolved).toBe(`http://127.0.0.1:${preferred + 1}`);
  });
});

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    killed: false,
    kill: vi.fn(() => true),
  });
}

describe("registerKernelCleanup", () => {
  it("stops an ephemeral kernel when its owning runtime exits", () => {
    const runtime = new EventEmitter();
    const child = fakeChild();

    registerKernelCleanup(child, runtime);
    runtime.emit("exit");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("removes the runtime exit hook after the kernel exits", () => {
    const runtime = new EventEmitter();
    const child = fakeChild();

    registerKernelCleanup(child, runtime);
    child.exitCode = 0;
    child.emit("exit");
    runtime.emit("exit");

    expect(child.kill).not.toHaveBeenCalled();
    expect(runtime.listenerCount("SIGHUP")).toBe(0);
  });

  it.each(["SIGINT", "SIGTERM", "SIGHUP", "disconnect"])(
    "stops the kernel and exits once it is gone when the runtime gets %s",
    async (event) => {
      const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const child = fakeChild();
      child.kill.mockImplementation(() => {
        queueMicrotask(() => { child.exitCode = 0; child.emit("exit"); });
        return true;
      });

      registerKernelCleanup(child, runtime);
      runtime.emit(event);
      await vi.waitFor(() => expect(runtime.exit).toHaveBeenCalledWith(0));

      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    },
  );

  it("force-stops and still exits when the kernel ignores SIGTERM", async () => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const child = fakeChild();
    const forceStop = vi.fn();
    const log = vi.fn();

    registerKernelCleanup(child, runtime, { graceMs: 20, forceStop, log });
    runtime.emit("SIGTERM");
    await vi.waitFor(() => expect(runtime.exit).toHaveBeenCalledWith(0));

    expect(forceStop).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("did not exit within 20ms"));
  });

  it("stops the kernel and exits non-zero on an uncaught exception", async () => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const child = fakeChild();
    const log = vi.fn();

    registerKernelCleanup(child, runtime, { graceMs: 20, log });
    runtime.emit("uncaughtException", new Error("boom"));
    await vi.waitFor(() => expect(runtime.exit).toHaveBeenCalledWith(1));

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
