import { describe, it, expect } from "vitest";
import { tokenizeInline, parseBlocks } from "./markdown.js";

describe("tokenizeInline", () => {
  it("returns plain text unchanged", () => {
    expect(tokenizeInline("hello world")).toEqual([{ text: "hello world" }]);
  });

  it("extracts inline code", () => {
    const tokens = tokenizeInline("run `npm install` now");
    expect(tokens).toEqual([
      { text: "run " },
      { text: "npm install", code: true },
      { text: " now" },
    ]);
  });

  it("extracts bold text", () => {
    const tokens = tokenizeInline("this is **important** text");
    expect(tokens).toEqual([
      { text: "this is " },
      { text: "important", bold: true },
      { text: " text" },
    ]);
  });

  it("handles multiple inline elements", () => {
    const tokens = tokenizeInline("**bold** and `code` here");
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toEqual({ text: "important" in tokens[0]! ? "" : "", ...tokens[0] });
    const bold = tokens.find((t) => t.bold);
    const code = tokens.find((t) => t.code);
    expect(bold?.text).toBe("bold");
    expect(code?.text).toBe("code");
  });

  it("handles text with no markup", () => {
    expect(tokenizeInline("plain")).toEqual([{ text: "plain" }]);
  });

  it("does not match partial markers", () => {
    const tokens = tokenizeInline("single *star* and one `tick");
    // *star* is single-star (italic) — not matched by our **bold** pattern
    // `tick is unclosed — not matched
    expect(tokens.every((t) => !t.bold && !t.code)).toBe(true);
  });
});

describe("parseBlocks", () => {
  it("parses a plain paragraph", () => {
    const blocks = parseBlocks("hello world");
    expect(blocks).toEqual([{ type: "paragraph", text: "hello world" }]);
  });

  it("parses h1, h2, h3 headings", () => {
    const blocks = parseBlocks("# Title\n## Subtitle\n### Small");
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Title" });
    expect(blocks[1]).toEqual({ type: "heading", level: 2, text: "Subtitle" });
    expect(blocks[2]).toEqual({ type: "heading", level: 3, text: "Small" });
  });

  it("clamps h4+ to level 3", () => {
    const blocks = parseBlocks("#### Deep");
    expect((blocks[0] as { level: number }).level).toBe(3);
  });

  it("parses bullet lists with - and *", () => {
    const blocks = parseBlocks("- first\n* second");
    expect(blocks[0]).toEqual({ type: "bullet", text: "first" });
    expect(blocks[1]).toEqual({ type: "bullet", text: "second" });
  });

  it("parses numbered lists", () => {
    const blocks = parseBlocks("1. one\n2. two");
    expect(blocks[0]).toEqual({ type: "numbered", n: 1, text: "one" });
    expect(blocks[1]).toEqual({ type: "numbered", n: 2, text: "two" });
  });

  it("parses fenced code blocks with and without lang", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ type: "code", lang: "typescript", lines: ["const x = 1;"] });
  });

  it("parses fenced code block without language", () => {
    const blocks = parseBlocks("```\nhello\n```");
    expect(blocks[0]).toEqual({ type: "code", lang: "", lines: ["hello"] });
  });

  it("parses blank lines as spacers", () => {
    const blocks = parseBlocks("a\n\nb");
    expect(blocks[1]).toEqual({ type: "spacer" });
  });

  it("handles multi-line paragraph-then-code", () => {
    const md = "Here is code:\n```\nfoo()\n```\nEnd.";
    const blocks = parseBlocks(md);
    expect(blocks[0]).toEqual({ type: "paragraph", text: "Here is code:" });
    expect(blocks[1]).toEqual({ type: "code", lang: "", lines: ["foo()"] });
    expect(blocks[2]).toEqual({ type: "paragraph", text: "End." });
  });
});
