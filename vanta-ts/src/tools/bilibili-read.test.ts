import { describe, expect, it } from "vitest";
import { bilibiliReadTool } from "./bilibili-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("bilibili_read tool", () => {
  it("validates action and required fields before reaching a backend", async () => {
    expect((await bilibiliReadTool.execute({}, ctx)).output).toContain("bilibili_read needs");
    expect((await bilibiliReadTool.execute({ action: "search" }, ctx)).output).toContain("needs query");
    expect((await bilibiliReadTool.execute({ action: "video" }, ctx)).output).toContain("needs url or bvid");
  });

  it("describes read-only intent for kernel safety", () => {
    expect(bilibiliReadTool.describeForSafety?.({ action: "search" })).toBe("read bilibili search");
  });
});
