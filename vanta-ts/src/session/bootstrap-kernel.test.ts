import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { KernelClient } from "../kernel/client.js";
import { bootstrapKernel } from "./bootstrap-kernel.js";

let fixture: string;
let root: string;
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-bootstrap-"));
  root = join(fixture, "project");
  await mkdir(root);
  vi.stubEnv("VANTA_HOME", join(fixture, "home"));
  vi.stubEnv("VANTA_SAFE_MODE", "");
  vi.stubEnv("VANTA_BARE", "");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(fixture, { recursive: true, force: true }); });

describe("bootstrapKernel", () => {
  it("constructs the client with the authoritative project root", async () => {
    const ensure = vi.fn(async () => "http://127.0.0.1:19001");
    const client = { status: vi.fn(async () => true) } as unknown as KernelClient;
    const create = vi.fn(() => client);

    await expect(bootstrapKernel(root, {
      configuredUrl: "http://127.0.0.1:7788",
      kernelBin: "/kernel",
      ensure,
      create,
    })).resolves.toBe(client);

    expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ root }));
    expect(create).toHaveBeenCalledWith("http://127.0.0.1:19001", root);
  });
});
