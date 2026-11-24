import { describe, expect, it } from "vitest";
import { applyMcpToolNamePolicy, applyMcpToolPolicy } from "./tool-policy.js";

const discovered = [{ name: "read" }, { name: "write" }];

describe("applyMcpToolPolicy mutation boundary", () => {
  it("keeps the documented default only when configuration is absent", () => {
    expect(applyMcpToolPolicy(discovered, undefined)).toEqual(discovered);
  });

  it("maps an explicit empty allowlist to exactly zero tools", () => {
    expect(applyMcpToolPolicy(discovered, [])).toEqual([]);
  });

  it("matches exact names only and never invents an unknown tool", () => {
    expect(applyMcpToolPolicy(discovered, ["read", "missing"])).toEqual([{ name: "read" }]);
    expect(applyMcpToolNamePolicy(["read", "write"], [])).toEqual([]);
  });
});
