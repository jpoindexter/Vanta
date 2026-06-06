import { describe, it, expect } from "vitest";
import { webSearchTool } from "./web-search.js";
import type { ToolContext } from "./types.js";

// Validation runs before any provider/network call, so a no-op ctx is enough.
const ctx = {} as ToolContext;

describe("webSearchTool argument validation", () => {
  it("returns an actionable error when query is missing", async () => {
    const result = await webSearchTool.execute({}, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("returns an actionable error when query is an empty string", async () => {
    const result = await webSearchTool.execute({ query: "" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("rejects max_results above the allowed range", async () => {
    const result = await webSearchTool.execute(
      { query: "vanta", max_results: 11 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("describes the safety-relevant query without touching the network", () => {
    const description = webSearchTool.describeForSafety?.({ query: "vanta ts" });

    expect(description).toBe("web search: vanta ts");
  });
});
