import { describe, it, expect } from "vitest";
import { extractReadable } from "./web-fetch.js";

const ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <title>The Migration of Arctic Terns</title>
  </head>
  <body>
    <nav><a href="/home">Home</a><a href="/about">About</a></nav>
    <script>window.tracking = function(){ console.log("pixel"); };</script>
    <article>
      <h1>The Migration of Arctic Terns</h1>
      <p>The Arctic tern undertakes the longest known migration of any animal,
      flying from its Arctic breeding grounds in the far north all the way down
      to the Antarctic pack ice and back again over the course of a single year.</p>
      <p>Over its lifetime a single bird may travel a distance equivalent to
      three round trips to the Moon, all powered by an unremarkable diet of small
      fish and crustaceans plucked from the surface of the open ocean.</p>
      <p>Researchers tracking the birds with tiny geolocators discovered that the
      terns do not fly in a straight line, but instead follow looping, wind-assisted
      routes across the Atlantic that add thousands of kilometres to the journey
      while saving a great deal of precious energy along the way.</p>
      <p>Because the tern chases an endless summer at both poles, it sees more
      daylight in a year than any other creature on Earth, a fact that has long
      fascinated ornithologists and casual birdwatchers alike around the world.</p>
    </article>
    <footer>Copyright 2026 Ornithology Weekly</footer>
  </body>
</html>`;

describe("extractReadable", () => {
  it("returns the document title from the head", () => {
    const { title } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(title).toBe("The Migration of Arctic Terns");
  });

  it("returns the article prose as text", () => {
    const { text } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(text).toContain("longest known migration of any animal");
    expect(text).toContain("three round trips to the Moon");
  });

  it("excludes nav and script noise from the text", () => {
    const { text } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(text).not.toContain("window.tracking");
    expect(text).not.toContain("pixel");
    expect(text).not.toContain("Home");
  });

  it("falls back to body text when there is no parseable article", () => {
    const html = "<html><body><div>Just a bare fragment of text.</div></body></html>";

    const { title, text } = extractReadable(html, "https://example.com/bare");

    expect(title).toBe("");
    expect(text).toContain("Just a bare fragment of text.");
  });
});
