import { describe, it, expect } from "vitest";
import { buildExaBody, mapExaJson, ExaProvider } from "./exa.js";

describe("buildExaBody (WEB-BACKEND-EXA)", () => {
  it("sends the query, numResults, and a text-snippet contents request", () => {
    const body = buildExaBody("neural search", { maxResults: 7 });
    expect(body).toMatchObject({ query: "neural search", numResults: 7 });
    expect(body.contents).toMatchObject({ text: { maxCharacters: 300 } });
    expect(body.includeDomains).toBeUndefined();
    expect(body.excludeDomains).toBeUndefined();
  });

  it("maps allowedDomains → includeDomains natively", () => {
    const body = buildExaBody("q", { allowedDomains: ["arxiv.org", "nature.com"] });
    expect(body.includeDomains).toEqual(["arxiv.org", "nature.com"]);
    expect(body.excludeDomains).toBeUndefined();
  });

  it("maps excludedDomains → excludeDomains natively", () => {
    const body = buildExaBody("q", { excludedDomains: ["pinterest.com"] });
    expect(body.excludeDomains).toEqual(["pinterest.com"]);
    expect(body.includeDomains).toBeUndefined();
  });

  it("defaults numResults when unset", () => {
    expect(buildExaBody("q").numResults).toBe(5);
  });
});

describe("mapExaJson (WEB-BACKEND-EXA)", () => {
  it("maps title/url and prefers a highlight for the snippet", () => {
    const json = { results: [{ title: "Attention", url: "https://arxiv.org/abs/1706", highlights: ["a relevant excerpt"], text: "full text body" }] };
    expect(mapExaJson(json, 5)).toEqual([{ title: "Attention", url: "https://arxiv.org/abs/1706", snippet: "a relevant excerpt" }]);
  });

  it("falls back to text, then summary, for the snippet", () => {
    const textOnly = { results: [{ title: "T", url: "https://x/1", text: "  the  page   text  " }] };
    expect(mapExaJson(textOnly, 5)[0]?.snippet).toBe("the page text");
    const summaryOnly = { results: [{ title: "T", url: "https://x/2", summary: "a summary" }] };
    expect(mapExaJson(summaryOnly, 5)[0]?.snippet).toBe("a summary");
  });

  it("skips entries missing a title or url, caps to max, tolerates malformed input", () => {
    const json = { results: [{ url: "https://x/1" }, { title: "ok", url: "https://x/2" }, { title: "ok2", url: "https://x/3" }] };
    expect(mapExaJson(json, 1)).toEqual([{ title: "ok", url: "https://x/2", snippet: "" }]);
    expect(mapExaJson({}, 5)).toEqual([]);
    expect(mapExaJson(null, 5)).toEqual([]);
  });

  it("truncates an over-long snippet with an ellipsis", () => {
    const long = "x".repeat(400);
    const snippet = mapExaJson({ results: [{ title: "T", url: "https://x/1", text: long }] }, 5)[0]?.snippet ?? "";
    expect(snippet.length).toBe(300);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("ExaProvider", () => {
  it("advertises native domain filtering so the tool skips the site: rewrite", () => {
    expect(new ExaProvider({ apiKey: "k" }).filtersDomains).toBe(true);
    expect(new ExaProvider({ apiKey: "k" }).id).toBe("exa");
  });
});
