import { describe, it, expect, afterEach } from "vitest";
import { lookAtCameraTool } from "./look-at-camera.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

describe("lookAtCameraTool", () => {
  const saved = { p: process.env.ARGO_PROVIDER, k: process.env.OPENAI_API_KEY };
  afterEach(() => {
    if (saved.p === undefined) delete process.env.ARGO_PROVIDER; else process.env.ARGO_PROVIDER = saved.p;
    if (saved.k === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.k;
  });
  it("fails fast (no capture) without a model", async () => {
    process.env.ARGO_PROVIDER = "openai"; delete process.env.OPENAI_API_KEY;
    const r = await lookAtCameraTool.execute({}, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/needs a model/);
  });
  it("is registered + leaks nothing in safety label", () => {
    expect(buildRegistry().schemas().some((s) => s.name === "look_at_camera")).toBe(true);
    expect(lookAtCameraTool.describeForSafety?.({ prompt: "x" })).toBe("capture and analyze a camera frame");
  });
});
