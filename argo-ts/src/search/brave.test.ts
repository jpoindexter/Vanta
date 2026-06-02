import { describe, expect, it } from "vitest";
import { mapBraveJson } from "./brave.js";

const FIXTURE = JSON.stringify({
  web: {
    results: [
      {
        title: "Argo project",
        url: "https://example.com/argo",
        description: "An agent kernel and TypeScript layer.",
      },
      {
        title: "Brave Search API",
        url: "https://brave.com/search/api",
        description: "Independent search index.",
      },
      {
        title: "Third result",
        url: "https://example.com/third",
        description: "Another snippet.",
      },
    ],
  },
});

describe("mapBraveJson", () => {
  it("maps description to snippet for each result", () => {
    const out = mapBraveJson(JSON.parse(FIXTURE), 5);

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      title: "Argo project",
      url: "https://example.com/argo",
      snippet: "An agent kernel and TypeScript layer.",
    });
  });

  it("caps results to max", () => {
    const out = mapBraveJson(JSON.parse(FIXTURE), 2);

    expect(out).toHaveLength(2);
    expect(out[1]?.title).toBe("Brave Search API");
  });

  it("returns [] when web is absent", () => {
    expect(mapBraveJson({ results: [] }, 5)).toEqual([]);
  });

  it("returns [] when web.results is absent", () => {
    expect(mapBraveJson({ web: {} }, 5)).toEqual([]);
  });

  it("skips entries missing title or url", () => {
    const json = {
      web: {
        results: [
          { url: "https://example.com/no-title", description: "x" },
          { title: "No url", description: "y" },
          {
            title: "Valid",
            url: "https://example.com/valid",
            description: "z",
          },
        ],
      },
    };

    const out = mapBraveJson(json, 5);

    expect(out).toEqual([
      {
        title: "Valid",
        url: "https://example.com/valid",
        snippet: "z",
      },
    ]);
  });

  it("returns [] for non-object input", () => {
    expect(mapBraveJson(null, 5)).toEqual([]);
    expect(mapBraveJson("nope", 5)).toEqual([]);
  });
});
