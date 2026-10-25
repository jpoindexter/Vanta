import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { KernelClient } from "../kernel/client.js";
import { bootstrapKernel } from "./bootstrap-kernel.js";
import { clearRunPrewarmsForTests, consumePrewarmedKernel, startRunPrewarm } from "./prewarm.js";
import * as preflight from "./settings-preflight.js";

let fixture: string;
let root: string;
let home: string;
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-kernel-policy-"));
  root = join(fixture, "project");
  home = join(fixture, "home");
  await Promise.all([mkdir(join(root, ".vanta"), { recursive: true }), mkdir(home)]);
  vi.stubEnv("VANTA_HOME", home);
  vi.stubEnv("VANTA_SAFE_MODE", "");
  vi.stubEnv("VANTA_BARE", "");
  clearRunPrewarmsForTests();
});
afterEach(async () => { clearRunPrewarmsForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(fixture, { recursive: true, force: true }); });

function scopePath(scope: string): string {
  return scope === "user" ? join(home, "settings.json") : join(root, ".vanta", scope === "project" ? "settings.json" : "settings.local.json");
}
function effects() {
  return { ensure: vi.fn(async () => "http://127.0.0.1:19001"), create: vi.fn(() => ({} as KernelClient)) };
}

describe("authoritative settings before kernel startup effects", () => {
  for (const scope of ["user", "project", "local"]) for (const raw of ["{", JSON.stringify({ blockedTools: false })]) {
    it(`rejects ${scope} ${raw === "{" ? "malformed JSON" : "invalid policy"} before ensure/client construction`, async () => {
      const file = scopePath(scope);
      await writeFile(file, raw);
      const deps = effects();
      await expect(bootstrapKernel(root, deps)).rejects.toThrow(file);
      expect(deps.ensure).not.toHaveBeenCalled();
      expect(deps.create).not.toHaveBeenCalled();
      expect(await readFile(file, "utf8")).toBe(raw);
    });
  }

  it("does not apply a valid policy env block during validation", async () => {
    await writeFile(scopePath("project"), JSON.stringify({ env: { VANTA_KERNEL_POLICY_MARKER: "not-applied" } }));
    const deps = effects();
    await bootstrapKernel(root, deps);
    expect(deps.ensure).toHaveBeenCalledOnce();
    expect(process.env.VANTA_KERNEL_POLICY_MARKER).toBeUndefined();
  });

  it("preserves safe-mode's explicit settings skip but not bare mode", async () => {
    await writeFile(scopePath("project"), "{");
    vi.stubEnv("VANTA_SAFE_MODE", "1");
    const safe = effects();
    await bootstrapKernel(root, safe);
    expect(safe.ensure).toHaveBeenCalledOnce();
    vi.stubEnv("VANTA_SAFE_MODE", "");
    vi.stubEnv("VANTA_BARE", "1");
    const bare = effects();
    await expect(bootstrapKernel(root, bare)).rejects.toThrow(scopePath("project"));
    expect(bare.ensure).not.toHaveBeenCalled();
  });

  it("rechecks policy before handing out a previously valid prewarm", async () => {
    const bootstrap = vi.fn(async () => ({} as KernelClient));
    startRunPrewarm(root, { bootstrap, preconnect: vi.fn(async () => undefined) });
    await vi.waitFor(() => expect(bootstrap).toHaveBeenCalledOnce());
    await writeFile(scopePath("local"), "{");
    const fallback = vi.fn(async () => ({} as KernelClient));
    await expect(consumePrewarmedKernel(root, { bootstrap: fallback })).rejects.toThrow(scopePath("local"));
    expect(fallback).not.toHaveBeenCalled();
  });
});

it("settles invalid prewarm validation without bootstrap or provider preconnect", async () => {
  const file = scopePath("project");
  await writeFile(file, JSON.stringify({ blockedTools: false }));
  const validate = vi.spyOn(preflight, "validateSettingsBeforeEffects");
  const bootstrap = vi.fn(async () => ({} as KernelClient));
  const preconnect = vi.fn(async () => undefined);
  startRunPrewarm(root, { bootstrap, preconnect });
  expect(validate).toHaveBeenCalledOnce();
  await expect(validate.mock.results[0]!.value).rejects.toThrow(file);
  expect(bootstrap).not.toHaveBeenCalled();
  expect(preconnect).not.toHaveBeenCalled();
});
