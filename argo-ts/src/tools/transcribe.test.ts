import { describe, it, expect } from "vitest";
import { transcribeTool } from "./transcribe.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

describe("transcribeTool", () => {
  it("requires a path", async () => {
    const r = await transcribeTool.execute({}, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/path/);
  });
  it("is registered + safety label leaks no content beyond the path", () => {
    expect(buildRegistry().schemas().some((s) => s.name === "transcribe")).toBe(true);
    expect(transcribeTool.describeForSafety?.({ path: "a.mp3" })).toBe("transcribe audio a.mp3");
  });
});
