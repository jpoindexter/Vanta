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

describe("parseBlocks — tables", () => {
  const TABLE_MD = "| Name | Size |\n| --- | --- |\n| app | 12k |\n| cli | 4k |";

  it("recognizes a table block with correct headers and rows", () => {
    const blocks = parseBlocks(TABLE_MD);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "table",
      headers: ["Name", "Size"],
      rows: [
        ["app", "12k"],
        ["cli", "4k"],
      ],
    });
  });

  it("supports alignment markers in the separator", () => {
    const md = "| A | B | C |\n| :-- | :--: | ---: |\n| 1 | 2 | 3 |";
    const blocks = parseBlocks(md);
    expect(blocks[0]).toMatchObject({
      type: "table",
      headers: ["A", "B", "C"],
      rows: [["1", "2", "3"]],
    });
  });

  it("table with no body rows is still a table", () => {
    const md = "| Col |\n| --- |";
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ type: "table", headers: ["Col"], rows: [] });
  });

  it("a pipe line without a separator on the next line stays a paragraph", () => {
    const blocks = parseBlocks("| not a table |");
    expect(blocks[0]).toEqual({ type: "paragraph", text: "| not a table |" });
  });

  it("does not consume the line after the table body", () => {
    const md = `${TABLE_MD}\nplain text`;
    const blocks = parseBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({ type: "paragraph", text: "plain text" });
  });
});
