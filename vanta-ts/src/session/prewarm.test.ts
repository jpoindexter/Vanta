import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { KernelClient } from "../kernel/client.js";
import {
  clearRunPrewarmsForTests,
  consumePrewarmedKernel,
  startRunPrewarm,
} from "./prewarm.js";

function client(id: string): KernelClient {
  return { id } as unknown as KernelClient;
}

let fixture: string;
let root: string;
let home: string;
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-prewarm-"));
  root = join(fixture, "project");
  home = join(fixture, "home");
  await Promise.all([mkdir(root), mkdir(home)]);
  vi.stubEnv("VANTA_HOME", home);
  vi.stubEnv("VANTA_SAFE_MODE", "");
  vi.stubEnv("VANTA_BARE", "");
});
afterEach(async () => { clearRunPrewarmsForTests(); vi.unstubAllEnvs(); await rm(fixture, { recursive: true, force: true }); });

describe("run prewarm", () => {
  it("is project-scoped and consumes only the matching kernel", async () => {
    clearRunPrewarmsForTests();
    const bootstrap = vi.fn(async (root: string) => client(root));
    startRunPrewarm(join(root, "a"), { bootstrap, preconnect: vi.fn(async () => undefined) });
    startRunPrewarm(join(root, "b"), { bootstrap, preconnect: vi.fn(async () => undefined) });

    await expect(consumePrewarmedKernel(join(root, "b"), { bootstrap })).resolves.toMatchObject({ id: join(root, "b") });
    await expect(consumePrewarmedKernel(join(root, "a"), { bootstrap })).resolves.toMatchObject({ id: join(root, "a") });
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });

  it("bounds a stuck prewarm and falls back without waiting for it", async () => {
    clearRunPrewarmsForTests();
    const stuck = new Promise<KernelClient>(() => {});
    startRunPrewarm(root, {
      bootstrap: vi.fn(() => stuck),
      preconnect: vi.fn(async () => undefined),
    });
    const fallback = vi.fn(async () => client("fallback"));

    const started = Date.now();
    await expect(consumePrewarmedKernel(root, { bootstrap: fallback, waitMs: 10 }))
      .resolves.toMatchObject({ id: "fallback" });
    expect(Date.now() - started).toBeLessThan(100);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("recovers from a failed prewarm through the normal bootstrap", async () => {
    clearRunPrewarmsForTests();
    startRunPrewarm(root, {
      bootstrap: vi.fn(async () => { throw new Error("prewarm failed"); }),
      preconnect: vi.fn(async () => undefined),
    });
    const fallback = vi.fn(async () => client("recovered"));
    await expect(consumePrewarmedKernel(root, { bootstrap: fallback }))
      .resolves.toMatchObject({ id: "recovered" });
  });

  it("never includes provider credentials in its project key", async () => {
    clearRunPrewarmsForTests();
    const bootstrap = vi.fn(async () => client("safe"));
    startRunPrewarm(root, {
      bootstrap,
      preconnect: vi.fn(async () => undefined),
      env: { VANTA_HOME: home, VANTA_API_KEY: "secret-value", VANTA_PROVIDER: "openai" },
    });
    await consumePrewarmedKernel(root, { bootstrap });
    expect(bootstrap).toHaveBeenCalledWith(root);
  });
});
