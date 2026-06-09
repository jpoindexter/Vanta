import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { configTool } from "./config.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("configTool", () => {
  const originalEnv = process.env.VANTA_PROVIDER;

  beforeEach(() => {
    delete process.env.VANTA_PROVIDER;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.VANTA_PROVIDER = originalEnv;
    } else {
      delete process.env.VANTA_PROVIDER;
    }
  });

  it("gets an unset key", async () => {
    const result = await configTool.execute({ action: "get", key: "VANTA_PROVIDER" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("VANTA_PROVIDER");
    expect(result.output).toContain("(unset)");
  });

  it("gets a set key", async () => {
    process.env.VANTA_PROVIDER = "openai";
    const result = await configTool.execute({ action: "get", key: "VANTA_PROVIDER" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("openai");
  });

  it("sets a key", async () => {
    const result = await configTool.execute(
      { action: "set", key: "VANTA_PROVIDER", value: "ollama" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Set");
    expect(process.env.VANTA_PROVIDER).toBe("ollama");
  });

  it("unsets a key when value is omitted", async () => {
    process.env.VANTA_PROVIDER = "openai";
    const result = await configTool.execute({ action: "set", key: "VANTA_PROVIDER" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Unset");
    expect(process.env.VANTA_PROVIDER).toBeUndefined();
  });

  it("rejects non-whitelisted keys", async () => {
    const result = await configTool.execute(
      { action: "get", key: "ARBITRARY_KEY" },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("not whitelisted");
  });

  it("rejects invalid action", async () => {
    const result = await configTool.execute(
      { action: "invalid", key: "VANTA_PROVIDER" },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid");
  });
});
