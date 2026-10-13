import { describe, expect, it } from "vitest";
import { adapterForRuntime, isRuntimeAdapter, runtimeIdFromAdapter } from "./adapter-id.js";

describe("runtime adapter ids", () => {
  it("round trips a runtime id", () => {
    expect(adapterForRuntime("claude-code")).toBe("cli:claude-code");
    expect(runtimeIdFromAdapter("cli:claude-code")).toBe("claude-code");
  });

  it("treats provider ids as native adapters", () => {
    expect(runtimeIdFromAdapter("openai")).toBeNull();
    expect(isRuntimeAdapter("openai")).toBe(false);
    expect(isRuntimeAdapter(undefined)).toBe(false);
  });

  it("rejects a malformed runtime id", () => {
    expect(runtimeIdFromAdapter("cli:Bad Id")).toBeNull();
    expect(runtimeIdFromAdapter("cli:")).toBeNull();
    expect(isRuntimeAdapter("cli:Bad Id")).toBe(true);
  });
});
