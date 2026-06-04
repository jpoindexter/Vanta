import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAtRefs, activeAtRef, buildContextBlock, listRepoFiles } from "./at-context.js";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("parseAtRefs", () => {
  it("extracts a single @ref", () => {
    expect(parseAtRefs("look at @src/foo.ts")).toEqual(["src/foo.ts"]);
  });

  it("extracts multiple @refs", () => {
    expect(parseAtRefs("compare @a.ts and @b.ts")).toEqual(["a.ts", "b.ts"]);
  });

  it("returns empty array when no @refs", () => {
    expect(parseAtRefs("hello world")).toEqual([]);
  });

  it("handles path with subdirectory", () => {
    expect(parseAtRefs("@src/tui/app.tsx")).toEqual(["src/tui/app.tsx"]);
  });
});

describe("activeAtRef", () => {
  it("returns partial path when @ is at end of input", () => {
    expect(activeAtRef("look at @src/f")).toBe("src/f");
  });

  it("returns empty string when only @ typed", () => {
    expect(activeAtRef("@")).toBe("");
  });

  it("returns null when @ is followed by whitespace (completed ref)", () => {
    expect(activeAtRef("@src/foo.ts done")).toBeNull();
  });

  it("returns null when no @ present", () => {
    expect(activeAtRef("hello world")).toBeNull();
  });

  it("tracks the last @ in multi-ref input", () => {
    expect(activeAtRef("@a.ts and @b")).toBe("b");
  });
});

describe("buildContextBlock", () => {
  it("returns empty string when no refs", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    const result = await buildContextBlock([], dir);
    expect(result).toBe("");
  });

  it("wraps file content in a <file> block", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    await writeFile(join(dir, "hello.txt"), "hello world", "utf8");
    const result = await buildContextBlock(["hello.txt"], dir);
    expect(result).toContain('<file path="hello.txt">');
    expect(result).toContain("hello world");
    expect(result).toContain("</file>");
  });

  it("skips missing files silently", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    const result = await buildContextBlock(["nope.ts"], dir);
    expect(result).toBe("");
  });

  it("joins multiple files", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    await writeFile(join(dir, "a.ts"), "A", "utf8");
    await writeFile(join(dir, "b.ts"), "B", "utf8");
    const result = await buildContextBlock(["a.ts", "b.ts"], dir);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
  });
});

describe("listRepoFiles", () => {
  it("lists files in the root", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    await writeFile(join(dir, "foo.ts"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).toContain("foo.ts");
  });

  it("recurses into subdirectories", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "bar.ts"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).toContain("src/bar.ts");
  });

  it("skips node_modules", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-at-"));
    await mkdir(join(dir, "node_modules"));
    await writeFile(join(dir, "node_modules", "pkg.js"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).not.toContain("node_modules/pkg.js");
  });
});
