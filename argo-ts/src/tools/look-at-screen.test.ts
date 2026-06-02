import { describe, it, expect, afterEach } from "vitest";
import { lookAtScreenTool } from "./look-at-screen.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("lookAtScreenTool", () => {
  const orig = process.env.OPENAI_API_KEY;
  afterEach(() => { if (orig === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = orig; });

  it("requires a vision key (no network without one)", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await lookAtScreenTool.execute({}, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/OPENAI_API_KEY/);
  });

  it("never leaks content in its safety label", () => {
    expect(lookAtScreenTool.describeForSafety?.({ prompt: "read my passwords" })).toBe("capture and analyze the screen");
  });

  it("is registered in the tool registry", () => {
    expect(buildRegistry().schemas().some((s) => s.name === "look_at_screen")).toBe(true);
  });
});
