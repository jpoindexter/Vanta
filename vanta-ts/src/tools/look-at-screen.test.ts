import { describe, it, expect, afterEach, vi } from "vitest";
import { createLookAtScreenTool, lookAtScreenTool } from "./look-at-screen.js";
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

  it("runs a captured screen through the vision model and emits a receipt", async () => {
    const complete = vi.fn(async () => ({ text: "The Vanta window is visible.", toolCalls: [], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }));
    const tool = createLookAtScreenTool({
      resolveProvider: () => ({ complete, modelId: () => "vision-test", contextWindow: () => 128_000, stream: async function* () {} }),
      capture: async () => ({ status: "captured", images: [{ name: "look-screen.png", mime: "image/png", dataBase64: "AAAA", capture: { source: "macos-screencapture", capturedAt: "2026-07-20T12:00:00.000Z", expiresAt: "2026-07-20T12:05:00.000Z", scope: "abcdef123456", mode: "screen", display: 1, bytes: 3 } }] }),
    });
    const result = await tool.execute({ prompt: "What app is open?" }, { ...ctx, root: "/project" });
    expect(result).toMatchObject({ ok: true, output: expect.stringContaining("Capture receipt: macos-screencapture") });
    expect(complete).toHaveBeenCalledWith([expect.objectContaining({ content: "What app is open?", images: [expect.objectContaining({ capture: expect.objectContaining({ mode: "screen" }) })] })], []);
  });


  it("is registered in the tool registry", () => {
    expect(buildRegistry().schemas().some((s) => s.name === "look_at_screen")).toBe(true);
  });
});
