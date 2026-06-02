import { describe, expect, it } from "vitest";
import { mapSearxngJson } from "./searxng.js";

const THREE_RESULTS = {
  results: [
    { title: "First", url: "https://a.example", content: "alpha snippet" },
    { title: "Second", url: "https://b.example", content: "beta snippet" },
    { title: "Third", url: "https://c.example", content: "gamma snippet" },
  ],
};

describe("mapSearxngJson", () => {
  it("maps content to snippet for each result", () => {
    const out = mapSearxngJson(THREE_RESULTS, 5);

    expect(out).toEqual([
      { title: "First", url: "https://a.example", snippet: "alpha snippet" },
      { title: "Second", url: "https://b.example", snippet: "beta snippet" },
      { title: "Third", url: "https://c.example", snippet: "gamma snippet" },
    ]);
  });

  it("caps the output to max", () => {
    const out = mapSearxngJson(THREE_RESULTS, 2);

    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe("First");
    expect(out[1]?.title).toBe("Second");
  });

  it("falls back to an empty snippet when content is missing", () => {
    const out = mapSearxngJson(
      { results: [{ title: "No content", url: "https://d.example" }] },
      5,
    );

    expect(out).toEqual([
      { title: "No content", url: "https://d.example", snippet: "" },
    ]);
  });

  it("skips entries missing a title or url", () => {
    const out = mapSearxngJson(
      {
        results: [
          { url: "https://no-title.example", content: "x" },
          { title: "No url", content: "y" },
          { title: "Keep", url: "https://keep.example", content: "z" },
        ],
      },
      5,
    );

    expect(out).toEqual([
      { title: "Keep", url: "https://keep.example", snippet: "z" },
    ]);
  });

  it("returns [] for malformed or empty input", () => {
    expect(mapSearxngJson({}, 5)).toEqual([]);
    expect(mapSearxngJson({ results: "nope" }, 5)).toEqual([]);
    expect(mapSearxngJson(null, 5)).toEqual([]);
    expect(mapSearxngJson(undefined, 5)).toEqual([]);
  });
});
