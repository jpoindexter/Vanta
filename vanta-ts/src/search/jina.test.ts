import { describe, expect, it } from "vitest";
import { parseJinaDdgMarkdown } from "./jina.js";

const MARKDOWN = `
# test at DuckDuckGo

## [Ad result](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Dexample.com)
Ad snippet.

## [First **Result**](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone)
First snippet.

## [Second Result](https://example.org/two)
Second snippet.
`;

describe("parseJinaDdgMarkdown", () => {
  it("extracts markdown result links, unwraps uddg URLs, and skips ads", () => {
    expect(parseJinaDdgMarkdown(MARKDOWN, 10)).toEqual([
      { title: "First Result", url: "https://example.com/one", snippet: "First snippet." },
      { title: "Second Result", url: "https://example.org/two", snippet: "Second snippet." },
    ]);
  });

  it("caps results", () => {
    expect(parseJinaDdgMarkdown(MARKDOWN, 1)).toHaveLength(1);
  });
});
