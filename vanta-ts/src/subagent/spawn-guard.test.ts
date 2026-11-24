import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveSpawnDepth,
  kernelBaseUrl,
  checkSpawnDepth,
  withSpawnDepth,
  FALLBACK_MAX_DEPTH,
} from "./spawn-guard.js";

let fixtureRoot: string;
beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "vanta-spawn-verdict-"));
  mkdirSync(join(fixtureRoot, ".vanta"));
  writeFileSync(join(fixtureRoot, ".vanta/api-token"), "fixture-transport-token");
  vi.stubEnv("VANTA_ROOT", fixtureRoot);
  vi.stubEnv("VANTA_PROFILE", "default");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(fixtureRoot, { recursive: true, force: true }); });

const jsonFetch = (verdict: unknown): typeof fetch =>
  (async () => Response.json(verdict));
const throwingFetch = (async () => {
  throw new Error("kernel down");
}) as unknown as typeof fetch;

describe("resolveSpawnDepth", () => {
  it("defaults to 0 and reads a valid seed, clamping garbage", () => {
    expect(resolveSpawnDepth({})).toBe(0);
    expect(resolveSpawnDepth({ VANTA_SPAWN_DEPTH: "3" })).toBe(3);
    expect(resolveSpawnDepth({ VANTA_SPAWN_DEPTH: "2.9" })).toBe(2);
    expect(resolveSpawnDepth({ VANTA_SPAWN_DEPTH: "-1" })).toBe(0);
    expect(resolveSpawnDepth({ VANTA_SPAWN_DEPTH: "nope" })).toBe(0);
  });
});

describe("kernelBaseUrl", () => {
  it("defaults to the local kernel and honors an override", () => {
    expect(kernelBaseUrl({})).toBe("http://127.0.0.1:7788");
    expect(kernelBaseUrl({ VANTA_KERNEL_URL: "http://x:9" })).toBe("http://x:9");
  });
});

describe("checkSpawnDepth", () => {
  it("maps a kernel allow verdict", async () => {
    const v = await checkSpawnDepth({
      parent: "a",
      child: "b",
      depth: 2,
      fetchImpl: jsonFetch({ allowed: true, reason: "ok", depth: 2, max_depth: 6 }),
    });
    expect(v).toEqual({ allowed: true, reason: "ok", depth: 2, maxDepth: 6 });
  });

  it("maps a kernel block verdict for runaway depth", async () => {
    const v = await checkSpawnDepth({
      parent: "a",
      child: "b",
      depth: 9,
      fetchImpl: jsonFetch({ allowed: false, reason: "runaway", depth: 9, max_depth: 6 }),
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("runaway");
  });

  it("refuses every depth when the kernel is unreachable", async () => {
    const shallow = await checkSpawnDepth({ parent: "a", child: "b", depth: 1, fetchImpl: throwingFetch });
    expect(shallow.allowed).toBe(false);
    const deep = await checkSpawnDepth({ parent: "a", child: "b", depth: FALLBACK_MAX_DEPTH + 1, fetchImpl: throwingFetch });
    expect(deep.allowed).toBe(false);
    expect(deep.reason).toContain("could not be verified");
  });

  it("refuses when the kernel returns a malformed verdict", async () => {
    const v = await checkSpawnDepth({
      parent: "a",
      child: "b",
      depth: 1,
      fetchImpl: jsonFetch({ not: "a verdict" }),
    });
    expect(v.allowed).toBe(false);
    expect(v.maxDepth).toBe(FALLBACK_MAX_DEPTH);
  });
});

describe("withSpawnDepth", () => {
  const prior = process.env.VANTA_SPAWN_DEPTH;
  afterEach(() => {
    if (prior === undefined) delete process.env.VANTA_SPAWN_DEPTH;
    else process.env.VANTA_SPAWN_DEPTH = prior;
  });

  it("sets the depth during the run and restores afterward", async () => {
    delete process.env.VANTA_SPAWN_DEPTH;
    let seen: string | undefined;
    await withSpawnDepth(4, async () => {
      seen = process.env.VANTA_SPAWN_DEPTH;
    });
    expect(seen).toBe("4");
    expect(process.env.VANTA_SPAWN_DEPTH).toBeUndefined();
  });

  it("restores a prior depth value after nesting", async () => {
    process.env.VANTA_SPAWN_DEPTH = "2";
    await withSpawnDepth(3, async () => {
      expect(process.env.VANTA_SPAWN_DEPTH).toBe("3");
    });
    expect(process.env.VANTA_SPAWN_DEPTH).toBe("2");
  });
});
