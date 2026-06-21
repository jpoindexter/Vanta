import { describe, it, expect } from "vitest";
import {
  resolveCopyFormat,
  markdownToHtml,
  markdownToRtf,
  formatForCopy,
  type CopyFormat,
} from "./copy-format.js";

describe("resolveCopyFormat", () => {
  it("returns the format unchanged for each known value", () => {
    expect(resolveCopyFormat("md")).toBe("md");
    expect(resolveCopyFormat("html")).toBe("html");
    expect(resolveCopyFormat("rtf")).toBe("rtf");
  });

  it("defaults to md for an empty arg", () => {
    expect(resolveCopyFormat("")).toBe("md");
  });

  it("defaults to md for an unknown format", () => {
    expect(resolveCopyFormat("pdf")).toBe("md");
    expect(resolveCopyFormat("docx")).toBe("md");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(resolveCopyFormat("HTML")).toBe("html");
    expect(resolveCopyFormat("  RtF  ")).toBe("rtf");
    expect(resolveCopyFormat(" md ")).toBe("md");
  });
});

describe("markdownToHtml", () => {
  it("renders headings at the right level", () => {
    expect(markdownToHtml("# Title")).toBe("<h1>Title</h1>");
    expect(markdownToHtml("### Deep")).toBe("<h3>Deep</h3>");
    expect(markdownToHtml("###### Six")).toBe("<h6>Six</h6>");
  });

  it("renders bold as <strong>", () => {
    expect(markdownToHtml("**hi**")).toBe("<p><strong>hi</strong></p>");
  });

  it("renders italic (* and _) as <em>", () => {
    expect(markdownToHtml("*hi*")).toBe("<p><em>hi</em></p>");
    expect(markdownToHtml("_hi_")).toBe("<p><em>hi</em></p>");
  });

  it("renders inline code as <code>", () => {
    expect(markdownToHtml("`x = 1`")).toBe("<p><code>x = 1</code></p>");
  });

  it("renders fenced code blocks as <pre><code>", () => {
    const md = "```\nconst a = 1;\nconst b = 2;\n```";
    expect(markdownToHtml(md)).toBe("<pre><code>const a = 1;\nconst b = 2;</code></pre>");
  });

  it("renders links as <a href>", () => {
    expect(markdownToHtml("[Vanta](https://vanta.dev)")).toBe(
      '<p><a href="https://vanta.dev">Vanta</a></p>',
    );
  });

  it("renders unordered lists as <ul>/<li>", () => {
    expect(markdownToHtml("- one\n- two")).toBe(
      "<ul>\n<li>one</li>\n<li>two</li>\n</ul>",
    );
  });

  it("renders ordered lists as <ol>/<li>", () => {
    expect(markdownToHtml("1. one\n2. two")).toBe(
      "<ol>\n<li>one</li>\n<li>two</li>\n</ol>",
    );
  });

  it("renders plain text as a paragraph", () => {
    expect(markdownToHtml("just words")).toBe("<p>just words</p>");
  });

  it("HTML-escapes literal text so a script tag is NOT a live tag", () => {
    const out = markdownToHtml("a <script>alert(1)</script> b");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;/script&gt;");
  });

  it("HTML-escapes link text and href so attributes can't be injected", () => {
    const out = markdownToHtml('[x](" onmouseover="evil)');
    expect(out).not.toContain('href="" onmouseover="evil"');
    expect(out).toContain("&quot;");
  });

  it("escapes ampersands and angle brackets in code blocks", () => {
    expect(markdownToHtml("`a < b && c`")).toBe("<p><code>a &lt; b &amp;&amp; c</code></p>");
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToHtml("")).toBe("");
  });
});

describe("markdownToRtf", () => {
  it("wraps output in a valid rtf document", () => {
    const out = markdownToRtf("hello");
    expect(out.startsWith("{\\rtf1")).toBe(true);
    expect(out.endsWith("}")).toBe(true);
  });

  it("renders bold runs", () => {
    expect(markdownToRtf("**hi**")).toContain("{\\b hi}");
  });

  it("renders italic runs for * and _", () => {
    expect(markdownToRtf("*hi*")).toContain("{\\i hi}");
    expect(markdownToRtf("_hi_")).toContain("{\\i hi}");
  });

  it("renders inline code as a monospace run", () => {
    expect(markdownToRtf("`code`")).toContain("{\\f1 code}");
  });

  it("escapes the RTF control chars { } and backslash in text", () => {
    const out = markdownToRtf("a {b} c \\d");
    expect(out).toContain("a \\{b\\} c \\\\d");
  });

  it("inserts paragraph breaks between blocks", () => {
    const out = markdownToRtf("first\n\nsecond");
    expect(out).toContain("\\par");
    expect(out).toContain("first");
    expect(out).toContain("second");
  });

  it("returns a valid empty document for empty input", () => {
    const out = markdownToRtf("");
    expect(out.startsWith("{\\rtf1")).toBe(true);
    expect(out.endsWith("}")).toBe(true);
  });
});

describe("formatForCopy", () => {
  const text = "# Hi\n\n**bold** and `code`";

  it("leaves md unchanged", () => {
    expect(formatForCopy(text, "md")).toBe(text);
  });

  it("routes html through markdownToHtml", () => {
    expect(formatForCopy(text, "html")).toBe(markdownToHtml(text));
  });

  it("routes rtf through markdownToRtf", () => {
    expect(formatForCopy(text, "rtf")).toBe(markdownToRtf(text));
  });

  it("round-trips a resolved unknown format to the md (unchanged) path", () => {
    const format: CopyFormat = resolveCopyFormat("bogus");
    expect(format).toBe("md");
    expect(formatForCopy(text, format)).toBe(text);
  });
});
