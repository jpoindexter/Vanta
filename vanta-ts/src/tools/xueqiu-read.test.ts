import { describe, expect, it } from "vitest";
import { xueqiuReadTool } from "./xueqiu-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("xueqiu_read tool", () => {
  it("validates action and required fields before reaching a backend", async () => {
    expect((await xueqiuReadTool.execute({}, ctx)).output).toContain("xueqiu_read needs");
    expect((await xueqiuReadTool.execute({ action: "quote" }, ctx)).output).toContain("needs symbol");
    expect((await xueqiuReadTool.execute({ action: "search" }, ctx)).output).toContain("needs query");
  });

  it("describes read-only intent for kernel safety", () => {
    expect(xueqiuReadTool.describeForSafety?.({ action: "hot_posts" })).toBe("read xueqiu hot_posts");
  });
});
