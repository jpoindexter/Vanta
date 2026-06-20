import { describe, expect, it } from "vitest";
import { partitionDeferred, runDeferred } from "./deferred-hooks.js";
import type { ShellHook } from "./shell-hooks.js";

const shell = (command: string, extra: Partial<ShellHook> = {}): ShellHook => ({ command, ...extra });

describe("partitionDeferred", () => {
  it("routes a defer:true hook to deferred and the rest inline", () => {
    const a = shell("a");
    const b = shell("b", { defer: true });
    const c = shell("c");
    const { inline, deferred } = partitionDeferred([a, b, c]);
    expect(inline).toEqual([a, c]);
    expect(deferred).toEqual([b]);
  });

  it("treats defer:false the same as absent (inline)", () => {
    const a = shell("a", { defer: false });
    const { inline, deferred } = partitionDeferred([a]);
    expect(inline).toEqual([a]);
    expect(deferred).toEqual([]);
  });

  it("no-defer is byte-identical: every hook stays inline, in order, deferred empty", () => {
    const hooks = [shell("a"), shell("b"), shell("c", { type: "shell" })];
    const { inline, deferred } = partitionDeferred(hooks);
    // Same length, same order, same references — identical to the prior all-inline behavior.
    expect(inline).toEqual(hooks);
    expect(inline.length).toBe(hooks.length);
    inline.forEach((hook, i) => expect(hook).toBe(hooks[i]));
    expect(deferred).toEqual([]);
  });

  it("returns empty partitions for an empty input", () => {
    expect(partitionDeferred([])).toEqual({ inline: [], deferred: [] });
  });

  it("does not mutate the input array", () => {
    const hooks = [shell("a", { defer: true }), shell("b")];
    const snapshot = [...hooks];
    partitionDeferred(hooks);
    expect(hooks).toEqual(snapshot);
  });

  it("preserves order within each partition", () => {
    const d1 = shell("d1", { defer: true });
    const i1 = shell("i1");
    const d2 = shell("d2", { defer: true });
    const i2 = shell("i2");
    const { inline, deferred } = partitionDeferred([d1, i1, d2, i2]);
    expect(deferred).toEqual([d1, d2]);
    expect(inline).toEqual([i1, i2]);
  });
});

describe("runDeferred", () => {
  it("calls the runner once per deferred hook", () => {
    const seen: string[] = [];
    const hooks = [shell("a", { defer: true }), shell("b", { defer: true })];
    runDeferred(hooks, async (h) => { seen.push(h.command ?? ""); });
    expect(seen).toEqual(["a", "b"]);
  });

  it("returns synchronously without awaiting the runner (fire-and-forget)", () => {
    let resolved = false;
    const slow: ShellHook = shell("slow", { defer: true });
    runDeferred([slow], () => new Promise<void>((resolve) => {
      setTimeout(() => { resolved = true; resolve(); }, 50);
    }));
    // The deferred work has NOT completed by the time runDeferred returns.
    expect(resolved).toBe(false);
  });

  it("does not throw when a deferred runner rejects", () => {
    const hooks = [shell("rejecter", { defer: true })];
    expect(() => runDeferred(hooks, () => Promise.reject(new Error("hook blew up")))).not.toThrow();
  });

  it("does not throw when a runner throws synchronously", () => {
    const hooks = [shell("thrower", { defer: true })];
    expect(() => runDeferred(hooks, () => { throw new Error("sync boom"); })).not.toThrow();
  });

  it("a rejecting deferred hook does not stop later deferred hooks from firing", () => {
    const seen: string[] = [];
    const hooks = [
      shell("bad", { defer: true }),
      shell("good", { defer: true }),
    ];
    runDeferred(hooks, (h) => {
      seen.push(h.command ?? "");
      return h.command === "bad" ? Promise.reject(new Error("nope")) : Promise.resolve();
    });
    expect(seen).toEqual(["bad", "good"]);
  });

  it("a rejecting deferred hook produces no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { rejections.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      runDeferred([shell("rej", { defer: true })], () => Promise.reject(new Error("swallowed")));
      // Let the microtask + a macrotask flush so any unhandled rejection would surface.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(rejections).toEqual([]);
  });

  it("is a no-op for an empty deferred list", () => {
    let called = 0;
    runDeferred([], () => { called++; return Promise.resolve(); });
    expect(called).toBe(0);
  });
});
