import { describe, it, expect } from "vitest";
import { browserReadTool } from "./browser-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("browser_read", () => {
  // These return before any browser launch, so no playwright/network is touched.
  it("rejects a missing/invalid url", async () => {
    expect((await browserReadTool.execute({}, ctx)).ok).toBe(false);
    expect((await browserReadTool.execute({ url: "not a url" }, ctx)).output).toContain('valid "url"');
  });

  it("describeForSafety surfaces the url (generic — any site)", () => {
    expect(browserReadTool.describeForSafety?.({ url: "https://reddit.com/r/x" })).toBe("browser read https://reddit.com/r/x");
  });
});
