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
});
