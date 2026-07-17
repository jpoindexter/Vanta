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

describe("registerKernelCleanup", () => {
  it("stops an ephemeral kernel when its owning runtime exits", () => {
    const runtime = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      killed: false,
      kill: vi.fn(() => true),
    });

    registerKernelCleanup(child, runtime);
    runtime.emit("exit");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("removes the runtime exit hook after the kernel exits", () => {
    const runtime = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      killed: false,
      kill: vi.fn(() => true),
    });

    registerKernelCleanup(child, runtime);
    child.exitCode = 0;
    child.emit("exit");
    runtime.emit("exit");

    expect(child.kill).not.toHaveBeenCalled();
  });

  it("stops the kernel and exits when the runtime receives SIGTERM", () => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      killed: false,
      kill: vi.fn(() => true),
    });

    registerKernelCleanup(child, runtime);
    runtime.emit("SIGTERM");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(runtime.exit).toHaveBeenCalledWith(0);
  });
});
