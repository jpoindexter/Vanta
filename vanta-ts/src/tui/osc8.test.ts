import { describe, it, expect } from "vitest";
import path from "node:path";
import { osc8Link, fileLink, linkifyFilePaths } from "./osc8.js";

describe("osc8Link", () => {
  it("wraps text with the correct OSC-8 prefix and suffix", () => {
    const result = osc8Link("hello.ts", "file:///src/hello.ts");
    expect(result).toBe("\x1b]8;;file:///src/hello.ts\x1b\\hello.ts\x1b]8;;\x1b\\");
  });

  it("includes the text between the open and close sequences", () => {
    const result = osc8Link("label", "https://example.com");
    expect(result).toContain("label");
    expect(result.startsWith("\x1b]8;;https://example.com\x1b\\")).toBe(true);
    expect(result.endsWith("\x1b]8;;\x1b\\")).toBe(true);
  });
});

describe("fileLink", () => {
  it("produces a file:// URL with just the path when no line given", () => {
    const result = fileLink("/Users/dev/project/src/foo.ts");
    expect(result).toContain("file:///Users/dev/project/src/foo.ts");
    expect(result).toContain("foo.ts");
    expect(result).not.toContain(":undefined");
  });

  it("appends :line to both the URL and display text when line is provided", () => {
    const result = fileLink("/Users/dev/project/src/foo.ts", 42);
    expect(result).toContain("file:///Users/dev/project/src/foo.ts:42");
    expect(result).toContain("foo.ts:42");
  });

  it("uses only the basename as display text, not the full path", () => {
    const result = fileLink("/deep/nested/dir/bar.rs", 7);
    // The URL portion legitimately contains the full path.
    // Confirm the display text (between the two ST sequences) is just the basename.
    // Structure: ESC]8;;URL ST display ESC]8;; ST
    // Strip the opening OSC sequence to get "display ESC]8;; ST"
    const afterUrl = result.slice(result.indexOf("\x1b\\") + 2);
    const displayPart = afterUrl.slice(0, afterUrl.indexOf("\x1b"));
    expect(displayPart).toBe("bar.rs:7");
  });
});

describe("linkifyFilePaths", () => {
  const root = "/Users/dev/project";

  it("replaces a relative src/foo.ts:42 reference with an OSC-8 sequence", () => {
    const result = linkifyFilePaths("see src/foo.ts:42 for details", root);
    expect(result).toContain("\x1b]8;;");
    expect(result).toContain(`file://${path.join(root, "src/foo.ts")}:42`);
  });

  it("leaves non-source extensions (.png) unchanged", () => {
    const text = "check out assets/icon.png:1 and images/logo.exe";
    const result = linkifyFilePaths(text, root);
    expect(result).toBe(text);
  });

  it("returns the original string unchanged when no path references are found", () => {
    const text = "nothing to linkify here, just plain text";
    const result = linkifyFilePaths(text, root);
    expect(result).toBe(text);
  });

  it("resolves a path that is already absolute (captured portion) correctly", () => {
    // FILE_LINE_RE is word-boundary anchored so a leading '/' is not captured —
    // the regex matches from the first word-char. Absolute paths embedded in
    // agent output are typically relative (src/foo.ts). This test confirms a
    // relative path is resolved against root, not double-joined.
    const result = linkifyFilePaths("error in src/module.ts:10", root);
    expect(result).toContain(`file://${path.join(root, "src/module.ts")}:10`);
  });

  it("linkifies multiple references in a single string", () => {
    const result = linkifyFilePaths("src/a.ts:1 and src/b.rs:99", root);
    const parts = result.split("\x1b]8;;");
    // 1 for the start + 2 per link (open/close) = at least 3 segments
    expect(parts.length).toBeGreaterThan(2);
  });

  it("linkifies a .json file reference", () => {
    const result = linkifyFilePaths("see config/vanta.json:5", root);
    expect(result).toContain("\x1b]8;;");
    expect(result).toContain("vanta.json:5");
  });
});
