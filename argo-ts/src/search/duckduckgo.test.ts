import { describe, expect, it } from "vitest";
import { parseDdgHtml } from "./duckduckgo.js";

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
