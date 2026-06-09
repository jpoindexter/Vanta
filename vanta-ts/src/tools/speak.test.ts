import { describe, it, expect } from "vitest";
import { speakTool } from "./speak.js";
import type { ToolContext } from "./types.js";

describe("speakTool", () => {
  it("requires text", async () => {
    const r = await speakTool.execute({}, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/text/);
  });
  it("safety label leaks nothing", () => {
    expect(speakTool.describeForSafety?.({ text: "my secret" })).toBe("speak text aloud");
  });
});
