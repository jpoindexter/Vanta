import { describe, it, expect } from "vitest";
import { resolveCodeIntelProvider } from "./index.js";
import { CodegraphProvider } from "./codegraph.js";
import { NullCodeIntelProvider } from "./null.js";

describe("resolveCodeIntelProvider", () => {
  it("defaults to codegraph when unset", () => {
    const p = resolveCodeIntelProvider({});
    expect(p).toBeInstanceOf(CodegraphProvider);
    expect(p.id).toBe("codegraph");
  });

  it("returns codegraph for auto and codegraph modes", () => {
    expect(resolveCodeIntelProvider({ VANTA_CODE_INTEL: "auto" })).toBeInstanceOf(CodegraphProvider);
    expect(resolveCodeIntelProvider({ VANTA_CODE_INTEL: "CodeGraph" })).toBeInstanceOf(CodegraphProvider);
  });

  it("returns the null adapter when off", () => {
    const p = resolveCodeIntelProvider({ VANTA_CODE_INTEL: "off" });
    expect(p).toBeInstanceOf(NullCodeIntelProvider);
    expect(p.id).toBe("null");
  });

  it("throws a clear error on an unknown mode", () => {
    expect(() => resolveCodeIntelProvider({ VANTA_CODE_INTEL: "bogus" })).toThrow(/Unknown VANTA_CODE_INTEL/);
  });
});

describe("NullCodeIntelProvider", () => {
  it("always reports unavailable and never throws on the check", async () => {
    const p = new NullCodeIntelProvider();
    expect(await p.isAvailable()).toBe(false);
  });

  it("throws a disabled error on every capability", async () => {
    const p = new NullCodeIntelProvider();
    await expect(p.context("x")).rejects.toThrow(/disabled/);
    await expect(p.search("x")).rejects.toThrow(/disabled/);
    await expect(p.affected(["a.ts"])).rejects.toThrow(/disabled/);
    await expect(p.status()).rejects.toThrow(/disabled/);
    await expect(p.index()).rejects.toThrow(/disabled/);
    await expect(p.sync()).rejects.toThrow(/disabled/);
  });
});
