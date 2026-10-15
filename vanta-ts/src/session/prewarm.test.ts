import { describe, expect, it, vi } from "vitest";
import type { KernelClient } from "../kernel/client.js";
import {
  clearRunPrewarmsForTests,
  consumePrewarmedKernel,
  startRunPrewarm,
} from "./prewarm.js";

function client(id: string): KernelClient {
  return { id } as unknown as KernelClient;
}

describe("run prewarm", () => {
  it("is project-scoped and consumes only the matching kernel", async () => {
    clearRunPrewarmsForTests();
    const bootstrap = vi.fn(async (root: string) => client(root));
    startRunPrewarm("/project/a", { bootstrap, preconnect: vi.fn(async () => undefined) });
    startRunPrewarm("/project/b", { bootstrap, preconnect: vi.fn(async () => undefined) });

    await expect(consumePrewarmedKernel("/project/b", { bootstrap })).resolves.toMatchObject({ id: "/project/b" });
    await expect(consumePrewarmedKernel("/project/a", { bootstrap })).resolves.toMatchObject({ id: "/project/a" });
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });

  it("bounds a stuck prewarm and falls back without waiting for it", async () => {
    clearRunPrewarmsForTests();
    const stuck = new Promise<KernelClient>(() => {});
    startRunPrewarm("/project", {
      bootstrap: vi.fn(() => stuck),
      preconnect: vi.fn(async () => undefined),
    });
    const fallback = vi.fn(async () => client("fallback"));

    const started = Date.now();
    await expect(consumePrewarmedKernel("/project", { bootstrap: fallback, waitMs: 10 }))
      .resolves.toMatchObject({ id: "fallback" });
    expect(Date.now() - started).toBeLessThan(100);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("recovers from a failed prewarm through the normal bootstrap", async () => {
    clearRunPrewarmsForTests();
    startRunPrewarm("/project", {
      bootstrap: vi.fn(async () => { throw new Error("prewarm failed"); }),
      preconnect: vi.fn(async () => undefined),
    });
    const fallback = vi.fn(async () => client("recovered"));
    await expect(consumePrewarmedKernel("/project", { bootstrap: fallback }))
      .resolves.toMatchObject({ id: "recovered" });
  });

  it("never includes provider credentials in its project key", async () => {
    clearRunPrewarmsForTests();
    const bootstrap = vi.fn(async () => client("safe"));
    startRunPrewarm("/project", {
      bootstrap,
      preconnect: vi.fn(async () => undefined),
      env: { VANTA_API_KEY: "secret-value", VANTA_PROVIDER: "openai" },
    });
    await consumePrewarmedKernel("/project", { bootstrap });
    expect(bootstrap).toHaveBeenCalledWith("/project");
  });
});
