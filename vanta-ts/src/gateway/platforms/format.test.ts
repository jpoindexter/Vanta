import { describe, it, expect } from "vitest";
import { protectCode, toPlain, toMarkdownV2, formatForDialect } from "./format.js";

describe("protectCode", () => {
  it("masks an inline code span and restores it verbatim", () => {
    const { masked, restore } = protectCode("run `npm test` now");

    expect(masked).not.toContain("`npm test`");
    expect(restore(masked)).toBe("run `npm test` now");
  });

  it("masks a fenced block and restores it verbatim", () => {
    const md = "before\n```js\nconst x = 1;\n```\nafter";

    const { masked, restore } = protectCode(md);

    expect(masked).not.toContain("```");
    expect(restore(masked)).toBe(md);
  });

  it("masks multiple distinct spans without crossing them", () => {
    const md = "`a` and `b` and ```\nc\n```";

    const { masked, restore } = protectCode(md);

    expect(masked.match(/`/g)).toBeNull();
    expect(restore(masked)).toBe(md);
  });

  it("matches a fence before its inner backticks, not as inline", () => {
    const md = "```\nhas `inner` backticks\n```";

    const { masked, restore } = protectCode(md);

    // The whole fence is one span; its inner `inner` is part of the restored code.
    expect(restore(masked)).toBe(md);
    expect(masked).not.toContain("inner");
  });

  it("leaves prose with no code untouched in masked output", () => {
    const { masked } = protectCode("**bold** plain prose");

    expect(masked).toBe("**bold** plain prose");
  });
});

describe("toPlain", () => {
  it("strips bold markers, keeping the word", () => {
    expect(toPlain("this is **bold** text")).toBe("this is bold text");
    expect(toPlain("this is __bold__ text")).toBe("this is bold text");
  });

  it("strips italic markers, keeping the word", () => {
    expect(toPlain("an *italic* word")).toBe("an italic word");
    expect(toPlain("an _italic_ word")).toBe("an italic word");
  });

  it("strips strikethrough markers", () => {
    expect(toPlain("~~gone~~ here")).toBe("gone here");
  });

  it("reduces a link to its label", () => {
    expect(toPlain("see [the docs](https://x.com) now")).toBe("see the docs now");
  });

  it("drops heading hashes, keeping the title", () => {
    expect(toPlain("## Section title")).toBe("Section title");
  });

  it("does not strip a lone asterisk used as a bullet", () => {
    expect(toPlain("* item one")).toBe("* item one");
  });
});

describe("toMarkdownV2", () => {
  it("escapes reserved punctuation so it renders literally", () => {
    expect(toMarkdownV2("a.b-c!")).toBe("a\\.b\\-c\\!");
  });

  it("escapes emphasis markers so they are not parsed as markup", () => {
    expect(toMarkdownV2("**bold**")).toBe("\\*\\*bold\\*\\*");
  });

  it("escapes a backslash itself", () => {
    expect(toMarkdownV2("a\\b")).toBe("a\\\\b");
  });
});

describe("formatForDialect — plain (IRC/ntfy/iMessage/Signal)", () => {
  it("converts **bold** to the bare word", () => {
    expect(formatForDialect("**done**", "plain")).toBe("done");
  });

  it("preserves an inline code span verbatim while stripping prose marks", () => {
    const out = formatForDialect("run `npm **test**` to **verify**", "plain");

    // The literal backticks survive; the bold INSIDE code is untouched; prose
    // bold around it is stripped.
    expect(out).toBe("run `npm **test**` to verify");
  });

  it("preserves a fenced code block verbatim", () => {
    const md = "fix it:\n```js\nif (a && b) return;\n```\ndone";

    const out = formatForDialect(md, "plain");

    expect(out).toContain("```js\nif (a && b) return;\n```");
    expect(out).toContain("fix it:");
    expect(out).toContain("done");
  });

  it("is idempotent-ish on text with no markdown", () => {
    const once = formatForDialect("just a plain reply", "plain");
    const twice = formatForDialect(once, "plain");

    expect(once).toBe("just a plain reply");
    expect(twice).toBe(once);
  });

  it("degrades a pipe table to bare heading + key:value bullets (bold stripped)", () => {
    const md = [
      "| Name | Role |",
      "| --- | --- |",
      "| Alice | Admin |",
      "| Bob | User |",
    ].join("\n");

    const out = formatForDialect(md, "plain");

    // The table becomes readable lines; the bold markers around the heading are
    // themselves stripped by the plain converter, leaving the bare label.
    expect(out).toBe(
      ["Alice", "- Role: Admin", "", "Bob", "- Role: User"].join("\n"),
    );
    expect(out).not.toContain("|");
    expect(out).not.toContain("**");
  });

  it("does NOT degrade a pipe table inside a fenced code block", () => {
    const md = ["```", "| A | B |", "| --- | --- |", "| 1 | 2 |", "```"].join("\n");

    const out = formatForDialect(md, "plain");

    // The fence (pipes and all) is masked as code and restored verbatim — no
    // bold headings, no bullets, the literal table survives.
    expect(out).toBe(md);
    expect(out).not.toContain("**1**");
  });

  it("leaves a shell pipe in prose unchanged (not a table)", () => {
    const out = formatForDialect("run `ls | grep foo` to filter", "plain");

    expect(out).toBe("run `ls | grep foo` to filter");
  });
});

describe("formatForDialect — telegram (MarkdownV2)", () => {
  it("escapes prose punctuation for MarkdownV2", () => {
    expect(formatForDialect("Hi. Done!", "telegram")).toBe("Hi\\. Done\\!");
  });

  it("passes a fenced code block through unescaped", () => {
    const md = "```\nconst x = 1.0;\n```";

    const out = formatForDialect(md, "telegram");

    // The code body keeps its literal dot — NOT escaped to `1\\.0`.
    expect(out).toBe("```\nconst x = 1.0;\n```");
  });

  it("passes an inline code span through unescaped while escaping prose", () => {
    const out = formatForDialect("set `a.b` now.", "telegram");

    expect(out).toBe("set `a.b` now\\.");
  });
});

describe("formatForDialect — markdown (Mattermost)", () => {
  it("returns markdown unchanged", () => {
    const md = "**bold**, `code`, and\n```\nfence\n```";

    expect(formatForDialect(md, "markdown")).toBe(md);
  });
});
