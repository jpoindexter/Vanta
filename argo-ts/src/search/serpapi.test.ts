import { describe, expect, it } from "vitest";
import { mapSerpapiJson } from "./serpapi.js";

const FIXTURE = JSON.stringify({
  organic_results: [
    {
      title: "Argo project",
      link: "https://example.com/argo",
      snippet: "An agent runtime.",
    },
    {
      title: "SerpAPI docs",
      link: "https://serpapi.com/search-api",
      snippet: "Google search API.",
    },
    {
      title: "Third result",
      link: "https://example.com/three",
      snippet: "More info.",
    },
  ],
});

describe("mapSerpapiJson", () => {
  it("maps link to url and snippet from a results payload", () => {
    const out = mapSerpapiJson(JSON.parse(FIXTURE), 5);

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      title: "Argo project",
      url: "https://example.com/argo",
      snippet: "An agent runtime.",
    });
    expect(out[1]!.url).toBe("https://serpapi.com/search-api");
  });

  it("caps results to max", () => {
    const out = mapSerpapiJson(JSON.parse(FIXTURE), 2);

    expect(out).toHaveLength(2);
    expect(out.map((r) => r.title)).toEqual(["Argo project", "SerpAPI docs"]);
  });

  it("skips entries missing title or link", () => {
    const json = {
      organic_results: [
        { link: "https://example.com/no-title", snippet: "x" },
        { title: "No link", snippet: "y" },
        { title: "Good", link: "https://example.com/good", snippet: "z" },
      ],
    };

    const out = mapSerpapiJson(json, 5);

    expect(out).toEqual([
      { title: "Good", url: "https://example.com/good", snippet: "z" },
    ]);
  });

  it("defaults missing snippet to empty string", () => {
    const out = mapSerpapiJson(
      { organic_results: [{ title: "T", link: "https://example.com/t" }] },
      5,
    );

    expect(out).toEqual([
      { title: "T", url: "https://example.com/t", snippet: "" },
    ]);
  });

  it("returns [] on malformed input", () => {
    expect(mapSerpapiJson(null, 5)).toEqual([]);
    expect(mapSerpapiJson("not json", 5)).toEqual([]);
    expect(mapSerpapiJson({}, 5)).toEqual([]);
    expect(mapSerpapiJson({ organic_results: "nope" }, 5)).toEqual([]);
  });
});
