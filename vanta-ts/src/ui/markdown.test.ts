import { describe, it, expect } from "vitest";
import { tokenizeInline, parseBlocks } from "./markdown.js";

describe("tokenizeInline", () => {
  it("splits **bold** and `code` runs from plain text", () => {
    const toks = tokenizeInline("run **npm test** then `vitest`");
    expect(toks).toEqual([
      { text: "run " },
      { text: "npm test", bold: true },
      { text: " then " },
      { text: "vitest", code: true },
    ]);
  });
});

describe("parseBlocks", () => {
  it("recognizes headings, bullets, numbered, and fenced code", () => {
    const md = "# Title\n- a bullet\n1. first\n```ts\nconst x = 1\n```\nplain";
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Title" });
    expect(blocks[1]).toEqual({ type: "bullet", text: "a bullet" });
    expect(blocks[2]).toEqual({ type: "numbered", n: 1, text: "first" });
    expect(blocks[3]).toEqual({ type: "code", lang: "ts", lines: ["const x = 1"] });
    expect(blocks[4]).toEqual({ type: "paragraph", text: "plain" });
  });
  it("emits a spacer for blank lines", () => {
    expect(parseBlocks("a\n\nb")[1]).toEqual({ type: "spacer" });
  });
});
