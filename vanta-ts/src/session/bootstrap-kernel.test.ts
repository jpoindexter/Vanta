import { describe, expect, it, vi } from "vitest";
import type { KernelClient } from "../kernel/client.js";
import { bootstrapKernel } from "./bootstrap-kernel.js";

describe("bootstrapKernel", () => {
  it("constructs the client with the authoritative project root", async () => {
    const ensure = vi.fn(async () => "http://127.0.0.1:19001");
    const client = { status: vi.fn(async () => true) } as unknown as KernelClient;
    const create = vi.fn(() => client);

    await expect(bootstrapKernel("/project", {
      configuredUrl: "http://127.0.0.1:7788",
      kernelBin: "/kernel",
      ensure,
      create,
    })).resolves.toBe(client);

    expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ root: "/project" }));
    expect(create).toHaveBeenCalledWith("http://127.0.0.1:19001", "/project");
  });
});
