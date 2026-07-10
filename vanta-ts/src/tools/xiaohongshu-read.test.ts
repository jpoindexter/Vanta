import { describe, expect, it } from "vitest";
import { xiaohongshuReadTool } from "./xiaohongshu-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("xiaohongshu_read tool", () => {
  it("validates action and required fields before reaching a backend", async () => {
    expect((await xiaohongshuReadTool.execute({}, ctx)).output).toContain("xiaohongshu_read needs");
    expect((await xiaohongshuReadTool.execute({ action: "search" }, ctx)).output).toContain("needs query");
    expect((await xiaohongshuReadTool.execute({ action: "note" }, ctx)).output).toContain("needs url or noteId");
    expect((await xiaohongshuReadTool.execute({ action: "comments" }, ctx)).output).toContain("needs url or noteId");
  });

  it("describes read-only intent for kernel safety", () => {
    expect(xiaohongshuReadTool.describeForSafety?.({ action: "search" })).toBe("read xiaohongshu search");
  });
});
