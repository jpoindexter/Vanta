import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { createKernelClient, type KernelClient } from "./client.js";

// The KernelClient port: the factory builds the default HTTP adapter, and any
// stub structurally satisfying the interface is a drop-in (what tests rely on).

describe("KernelClient port", () => {
  it("factory builds a client exposing the full port surface", () => {
    const c = createKernelClient("http://127.0.0.1:7788");
    for (const m of ["status", "assess", "getGoals", "addGoal", "completeGoal", "getApprovals", "proposeApproval", "approve", "deny", "logEvent"] as const) {
      expect(typeof c[m]).toBe("function");
    }
  });

  it("accepts a stub adapter via the same interface (no concrete dependency)", async () => {
    let logged = "";
    const stub: KernelClient = {
      status: async () => true,
      assess: async () => ({ risk: "allow", needsHuman: false, reason: "stub" }),
      getGoals: async () => [],
      addGoal: async () => true,
      completeGoal: async () => true,
      getApprovals: async () => [],
      proposeApproval: async () => 1,
      approve: async () => {},
      deny: async () => {},
      logEvent: async (e) => { logged = e; },
    };
    await stub.logEvent("hello");
    expect(logged).toBe("hello");
    expect((await stub.assess("read x")).risk).toBe("allow");
  });

  it("uses an explicit kernel root instead of a nearer caller token", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-kernel-client-"));
    const nested = join(root, "package");
    await mkdir(join(root, ".vanta"));
    await mkdir(join(nested, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "api-token"), "root-token\n");
    await writeFile(join(nested, ".vanta", "api-token"), "wrong-token\n");

    let authorization = "";
    const server = createServer((request, response) => {
      authorization = request.headers.authorization ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ risk: "allow", needs_human: false, reason: "test" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    try {
      await createKernelClient(`http://127.0.0.1:${address.port}`, root).assess("test");
      expect(authorization).toBe("Bearer root-token");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
