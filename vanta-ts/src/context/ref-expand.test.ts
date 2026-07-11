import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expandContextRefs, parseContextRefs } from "./ref-expand.js";

describe("parseContextRefs", () => {
  it("parses every v2 reference and keeps legacy @path support", () => {
    expect(parseContextRefs(
      "Use @file:src/a.ts:10-25 @folder:docs @diff @staged @git:3 @url:https://example.com/a?q=1 @README.md",
    )).toEqual([
      { raw: "@file:src/a.ts:10-25", kind: "file", value: "src/a.ts", range: [10, 25] },
      { raw: "@folder:docs", kind: "folder", value: "docs" },
      { raw: "@diff", kind: "diff" },
      { raw: "@staged", kind: "staged" },
      { raw: "@git:3", kind: "git", count: 3 },
      { raw: "@url:https://example.com/a?q=1", kind: "url", value: "https://example.com/a?q=1" },
      { raw: "@README.md", kind: "file", value: "README.md" },
    ]);
  });

  it("does not treat email addresses as references", () => {
    expect(parseContextRefs("email dev@example.com")).toEqual([]);
  });
});

describe("expandContextRefs", () => {
  it("expands file ranges, folders, diffs, staged changes, history, and URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-refs-"));
    try {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "src", "a.ts"), "one\ntwo\nthree\nfour\n", "utf8");
      const git = async (args: string[]) => args.includes("--cached") ? "staged patch" : args[0] === "log" ? "abc change" : "work patch";
      const result = await expandContextRefs(
        "Review @file:src/a.ts:2-3 @folder:src @diff @staged @git:2 @url:https://example.com/doc",
        root,
        { git, fetchUrl: async () => "remote body" },
      );
      expect(result.block).toContain('<file path="src/a.ts" lines="2-3">\ntwo\nthree\n</file>');
      expect(result.block).toContain('<folder path="src">\na.ts\n</folder>');
      expect(result.block).toContain('<git kind="diff">\nwork patch\n</git>');
      expect(result.block).toContain('<git kind="staged">\nstaged patch\n</git>');
      expect(result.block).toContain('<git kind="history" count="2">\nabc change\n</git>');
      expect(result.block).toContain('<url href="https://example.com/doc">\nremote body\n</url>');
      expect(result.expanded).toHaveLength(6);
      expect(result.warnings).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns visible warnings for out-of-scope, sensitive, binary, missing, and oversized refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-refs-"));
    try {
      await writeFile(join(root, ".env"), "TOKEN=secret", "utf8");
      await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
      await writeFile(join(root, "large.txt"), "x".repeat(30), "utf8");
      const result = await expandContextRefs(
        "@file:../outside @file:.env @file:binary.bin @file:missing @file:large.txt",
        root,
        { maxRefChars: 20 },
      );
      expect(result.block).toContain("<context-warnings>");
      expect(result.warnings.join("\n")).toMatch(/outside project root/i);
      expect(result.warnings.join("\n")).toMatch(/sensitive/i);
      expect(result.warnings.join("\n")).toMatch(/binary/i);
      expect(result.warnings.join("\n")).toMatch(/unreadable|missing/i);
      expect(result.warnings.join("\n")).toMatch(/20 character limit/i);
      expect(result.expanded).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enforces the total context cap without silently truncating", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-refs-"));
    try {
      await writeFile(join(root, "a.txt"), "a".repeat(12), "utf8");
      await writeFile(join(root, "b.txt"), "b".repeat(12), "utf8");
      const result = await expandContextRefs("@a.txt @b.txt", root, { maxRefChars: 20, maxTotalChars: 20 });
      expect(result.expanded).toEqual(["@a.txt"]);
      expect(result.warnings.join("\n")).toMatch(/total context limit/i);
      expect(result.block).not.toContain("bbbb");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("warns when a folder listing reaches its hard file cap", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-refs-"));
    try {
      await mkdir(join(root, "many"));
      await Promise.all(Array.from({ length: 201 }, (_, i) => writeFile(join(root, "many", `${i}.txt`), "")));
      const result = await expandContextRefs("@folder:many", root);
      expect(result.warnings.join("\n")).toMatch(/limited to 200 files/i);
      expect(result.block).toContain("<context-warnings>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces URL safety failures as warnings", async () => {
    const result = await expandContextRefs("@url:http://127.0.0.1/private", process.cwd(), {
      fetchUrl: async () => { throw new Error("SSRF guard: blocked private address"); },
    });
    expect(result.warnings[0]).toMatch(/blocked private address/i);
    expect(result.expanded).toEqual([]);
  });
});
