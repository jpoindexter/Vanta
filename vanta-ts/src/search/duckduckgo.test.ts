import { describe, expect, it } from "vitest";
import { parseDdgHtml, parseDdgLiteHtml, parseInstantAnswers } from "./duckduckgo.js";

describe("parseInstantAnswers", () => {
  it("leads with the abstract, then flattens related topics", () => {
    const json = {
      Heading: "Bubble tea",
      AbstractText: "Bubble tea is a tea-based drink.",
      AbstractURL: "https://en.wikipedia.org/wiki/Bubble_tea",
      RelatedTopics: [
        { Text: "Boba - the tapioca pearls", FirstURL: "https://example.com/boba" },
        { Topics: [{ Text: "Taro milk tea", FirstURL: "https://example.com/taro" }] },
      ],
    };
    const r = parseInstantAnswers(json, 5);
    expect(r[0]).toEqual({ title: "Bubble tea", url: "https://en.wikipedia.org/wiki/Bubble_tea", snippet: "Bubble tea is a tea-based drink." });
    expect(r[1]).toEqual({ title: "Boba", url: "https://example.com/boba", snippet: "Boba - the tapioca pearls" });
    expect(r[2]?.url).toBe("https://example.com/taro"); // nested group flattened
  });

  it("skips topics missing a url or text, and caps at max", () => {
    const json = { RelatedTopics: [{ Text: "no url" }, { Text: "ok", FirstURL: "https://e.com/ok" }] };
    const r = parseInstantAnswers(json, 1);
    expect(r).toHaveLength(1);
    expect(r[0]?.url).toBe("https://e.com/ok");
  });
});

// The lite.duckduckgo.com SERP: result links + positionally-paired snippet cells.
const LITE_FIXTURE = `
<table>
  <tr><td><a class="result-link" href="https://example.com/one">First Lite</a></td></tr>
  <tr><td class="result-snippet">Snippet one from lite.</td></tr>
  <tr><td><a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Ftwo">Second Lite</a></td></tr>
  <tr><td class="result-snippet">Snippet two from lite.</td></tr>
</table>`;

describe("parseDdgLiteHtml", () => {
  it("parses lite results with decoded urls + paired snippets", () => {
    const results = parseDdgLiteHtml(LITE_FIXTURE, 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: "First Lite", url: "https://example.com/one", snippet: "Snippet one from lite." });
    expect(results[1]?.url).toBe("https://example.org/two");
  });

  it("caps lite results at max", () => {
    expect(parseDdgLiteHtml(LITE_FIXTURE, 1)).toHaveLength(1);
  });
});

// Two result blocks: first uses a uddg redirect href, second a plain https href.
const FIXTURE = `
<div class="results">
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone&amp;rut=abc">
      First Result
    </a>
    <a class="result__snippet">  Snippet about the first result.  </a>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.org/two"> Second Result </a>
    <a class="result__snippet">Snippet about the second result.</a>
  </div>
</div>
`;

describe("parseDdgHtml", () => {
  it("returns 2 results with decoded urls, titles, and snippets from html", () => {
    const results = parseDdgHtml(FIXTURE, 5);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "First Result",
      url: "https://example.com/one",
      snippet: "Snippet about the first result.",
    });
    expect(results[1]).toEqual({
      title: "Second Result",
      url: "https://example.org/two",
      snippet: "Snippet about the second result.",
    });
  });

  it("caps the result count at max", () => {
    const results = parseDdgHtml(FIXTURE, 1);

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("First Result");
  });

  it("skips entries with empty title or url", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com/ok">Has Title</a>
        <a class="result__snippet">ok</a>
      </div>
      <div class="result">
        <a class="result__a" href="https://example.com/empty">   </a>
        <a class="result__snippet">no title</a>
      </div>`;

    const results = parseDdgHtml(html, 5);

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/ok");
  });
});
