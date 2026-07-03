import { describe, it, expect } from "vitest";
import { buildFirecrawlBody, mapFirecrawlJson, FirecrawlProvider } from "./firecrawl.js";

describe("buildFirecrawlBody (WEB-BACKENDS-MANAGED)", () => {
  it("sends query + limit, maps domain scope to include/excludeDomains", () => {
    expect(buildFirecrawlBody("q", { maxResults: 8 })).toEqual({ query: "q", limit: 8 });
    expect(buildFirecrawlBody("q", { allowedDomains: ["a.com"] })).toMatchObject({ includeDomains: ["a.com"] });
    expect(buildFirecrawlBody("q", { excludedDomains: ["b.com"] })).toMatchObject({ excludeDomains: ["b.com"] });
  });
});

describe("mapFirecrawlJson", () => {
  it("maps data.web title/url/description→snippet, skips title/url-less, caps, tolerant", () => {
    const json = { data: { web: [{ title: "T", url: "https://x/1", description: "desc" }, { url: "https://x/2" }] } };
    expect(mapFirecrawlJson(json, 5)).toEqual([{ title: "T", url: "https://x/1", snippet: "desc" }]);
    const two = { data: { web: [{ title: "a", url: "https://x/1" }, { title: "b", url: "https://x/2" }] } };
    expect(mapFirecrawlJson(two, 1)).toHaveLength(1);
    expect(mapFirecrawlJson({ data: {} }, 5)).toEqual([]);
    expect(mapFirecrawlJson(null, 5)).toEqual([]);
  });
});

describe("FirecrawlProvider", () => {
  it("advertises native domain filtering", () => {
    expect(new FirecrawlProvider({ apiKey: "k" }).filtersDomains).toBe(true);
    expect(new FirecrawlProvider({ apiKey: "k" }).id).toBe("firecrawl");
  });
});
