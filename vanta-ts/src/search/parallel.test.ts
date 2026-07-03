import { describe, it, expect } from "vitest";
import { buildParallelBody, mapParallelJson, ParallelProvider } from "./parallel.js";
import type { SearchProvider } from "./interface.js";

describe("buildParallelBody (WEB-BACKENDS-MANAGED)", () => {
  it("uses the query as both the objective and the seed query", () => {
    expect(buildParallelBody("find X", 6)).toEqual({ objective: "find X", search_queries: ["find X"], max_results: 6 });
  });
});

describe("mapParallelJson", () => {
  it("maps title/url + first excerpt→snippet, skips title/url-less, caps, tolerant", () => {
    const json = { results: [{ title: "T", url: "https://x/1", excerpts: ["  first  excerpt ", "second"] }, { url: "https://x/2" }] };
    expect(mapParallelJson(json, 5)).toEqual([{ title: "T", url: "https://x/1", snippet: "first excerpt" }]);
    const two = { results: [{ title: "a", url: "https://x/1", excerpts: [] }, { title: "b", url: "https://x/2", excerpts: [] }] };
    expect(mapParallelJson(two, 1)).toHaveLength(1);
    expect(mapParallelJson(null, 5)).toEqual([]);
  });

  it("truncates an over-long excerpt with an ellipsis", () => {
    const snippet = mapParallelJson({ results: [{ title: "T", url: "https://x/1", excerpts: ["y".repeat(400)] }] }, 5)[0]?.snippet ?? "";
    expect(snippet.length).toBe(300);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("ParallelProvider", () => {
  it("does NOT claim native domain filtering (uses the query rewrite)", () => {
    const p: SearchProvider = new ParallelProvider({ apiKey: "k" });
    expect(p.filtersDomains).toBeUndefined();
    expect(p.id).toBe("parallel");
  });
});
