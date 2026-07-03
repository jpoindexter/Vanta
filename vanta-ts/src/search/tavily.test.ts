import { describe, it, expect } from "vitest";
import { buildTavilyBody, mapTavilyJson, TavilyProvider } from "./tavily.js";

describe("buildTavilyBody (WEB-BACKENDS-MANAGED)", () => {
  it("sends query + max_results, maps domain scope to include/exclude_domains", () => {
    expect(buildTavilyBody("q", { maxResults: 8 })).toEqual({ query: "q", max_results: 8 });
    expect(buildTavilyBody("q", { allowedDomains: ["a.com"] })).toMatchObject({ include_domains: ["a.com"] });
    expect(buildTavilyBody("q", { excludedDomains: ["b.com"] })).toMatchObject({ exclude_domains: ["b.com"] });
    expect(buildTavilyBody("q").max_results).toBe(5);
  });
});

describe("mapTavilyJson", () => {
  it("maps title/url/content→snippet, skips title/url-less, caps to max, tolerant", () => {
    const json = { results: [{ title: "T", url: "https://x/1", content: "snippet text" }, { url: "https://x/2" }] };
    expect(mapTavilyJson(json, 5)).toEqual([{ title: "T", url: "https://x/1", snippet: "snippet text" }]);
    expect(mapTavilyJson({ results: [{ title: "a", url: "https://x/1" }, { title: "b", url: "https://x/2" }] }, 1)).toHaveLength(1);
    expect(mapTavilyJson(null, 5)).toEqual([]);
  });
});

describe("TavilyProvider", () => {
  it("advertises native domain filtering", () => {
    expect(new TavilyProvider({ apiKey: "k" }).filtersDomains).toBe(true);
    expect(new TavilyProvider({ apiKey: "k" }).id).toBe("tavily");
  });
});
