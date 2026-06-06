import { describe, it, expect, afterEach } from "vitest";
import { lookAtScreenTool } from "./look-at-screen.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("lookAtScreenTool", () => {
  const saved = { provider: process.env.VANTA_PROVIDER, key: process.env.OPENAI_API_KEY };
  afterEach(() => {
    if (saved.provider === undefined) delete process.env.VANTA_PROVIDER;
    else process.env.VANTA_PROVIDER = saved.provider;
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.key;
  });

  it("fails fast (no screen capture) when no model is configured", async () => {
    process.env.VANTA_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY; // openai with no key → resolveProvider throws
    const r = await lookAtScreenTool.execute({}, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/needs a model/);
  });

  it("never leaks content in its safety label", () => {
    expect(lookAtScreenTool.describeForSafety?.({ prompt: "read my passwords" })).toBe("capture and analyze the screen");
  });


  it("is registered in the tool registry", () => {
    expect(buildRegistry().schemas().some((s) => s.name === "look_at_screen")).toBe(true);
  });
});
