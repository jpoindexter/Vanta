import { describe, it, expect } from "vitest";
import { AuthPendingRegistry } from "./auth-pending.js";
import type { McpAuthConfig } from "./auth-flow.js";

const cfg: McpAuthConfig = {
  authorizationUrl: "https://example.com/authorize",
  tokenUrl: "https://example.com/token",
  clientId: "abc",
};

describe("AuthPendingRegistry", () => {
  it("marks, reads, and clears pending servers", () => {
    const r = new AuthPendingRegistry();
    expect(r.has("foo")).toBe(false);
    r.mark("foo", cfg);
    expect(r.has("foo")).toBe(true);
    expect(r.get("foo")).toEqual({ name: "foo", authConfig: cfg });
    r.clear("foo");
    expect(r.has("foo")).toBe(false);
    expect(r.get("foo")).toBeUndefined();
  });

  it("lists pending names sorted", () => {
    const r = new AuthPendingRegistry();
    r.mark("zebra", cfg);
    r.mark("apple", cfg);
    expect(r.names()).toEqual(["apple", "zebra"]);
  });

  it("mark overwrites a prior entry for the same name", () => {
    const r = new AuthPendingRegistry();
    r.mark("foo", cfg);
    const cfg2 = { ...cfg, clientId: "xyz" };
    r.mark("foo", cfg2);
    expect(r.get("foo")?.authConfig.clientId).toBe("xyz");
  });
});
