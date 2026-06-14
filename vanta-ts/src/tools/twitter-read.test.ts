import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { twitterReadTool } from "./twitter-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

let prevPath: string | undefined;
beforeEach(() => {
  // No twitter-cli on the test PATH → exercises the graceful "not installed" path.
  prevPath = process.env.PATH;
  process.env.PATH = "/nonexistent";
});
afterEach(() => {
  process.env.PATH = prevPath;
});

describe("twitter_read", () => {
  it("validates action + query", async () => {
    expect((await twitterReadTool.execute({}, ctx)).ok).toBe(false);
    expect((await twitterReadTool.execute({ action: "search" }, ctx)).output).toContain("needs a query");
  });

  it("returns the install step when twitter-cli is absent", async () => {
    const r = await twitterReadTool.execute({ action: "search", query: "manual work" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("uv tool install twitter-cli");
  });

  it("describeForSafety surfaces the action + query", () => {
    expect(twitterReadTool.describeForSafety?.({ action: "search", query: "ai agents" })).toBe("twitter search: ai agents");
  });
});
