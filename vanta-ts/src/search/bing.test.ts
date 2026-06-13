import { describe, expect, it } from "vitest";
import { parseBingHtml } from "./bing.js";

const HTML = `
<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://example.com/one">First result</a></h2>
    <div class="b_caption"><p>First snippet.</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="//example.org/two">Second result</a></h2>
    <p>Second snippet.</p>
  </li>
  <li class="b_algo">
    <h2><a href="/local/path">Skip local result</a></h2>
  </li>
</ol>`;

describe("parseBingHtml", () => {
  it("extracts titled web results and snippets", () => {
    expect(parseBingHtml(HTML, 10)).toEqual([
      { title: "First result", url: "https://example.com/one", snippet: "First snippet." },
      { title: "Second result", url: "https://example.org/two", snippet: "Second snippet." },
    ]);
  });

  it("caps results", () => {
    expect(parseBingHtml(HTML, 1)).toHaveLength(1);
  });
});
