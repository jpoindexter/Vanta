import { describe, it, expect } from "vitest";
import { linkedinReadTool } from "./linkedin-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("linkedin_read", () => {
  // These return before any browser launch — no playwright/network touched.
  it("rejects a missing/invalid url", async () => {
    expect((await linkedinReadTool.execute({}, ctx)).ok).toBe(false);
    expect((await linkedinReadTool.execute({ url: "not a url" }, ctx)).output).toContain('valid "url"');
  });

  it("rejects a non-linkedin url (points to browser_read)", async () => {
    const r = await linkedinReadTool.execute({ url: "https://example.com" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("browser_read");
  });

  it("describeForSafety surfaces the url", () => {
    expect(linkedinReadTool.describeForSafety?.({ url: "https://www.linkedin.com/in/x" })).toBe("linkedin read https://www.linkedin.com/in/x");
  });
});
