import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAtRefs,
  activeAtRef,
  buildContextBlock,
  listRepoFiles,
  parseGitignore,
} from "./at-context.js";
import { shouldRespectGitignore } from "../settings/git-settings.js";

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
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    const result = await buildContextBlock([], dir);
    expect(result).toBe("");
  });

  it("wraps file content in a <file> block", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await writeFile(join(dir, "hello.txt"), "hello world", "utf8");
    const result = await buildContextBlock(["hello.txt"], dir);
    expect(result).toContain('<file path="hello.txt">');
    expect(result).toContain("hello world");
    expect(result).toContain("</file>");
  });

  it("skips missing files silently", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    const result = await buildContextBlock(["nope.ts"], dir);
    expect(result).toBe("");
  });

  it("joins multiple files", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await writeFile(join(dir, "a.ts"), "A", "utf8");
    await writeFile(join(dir, "b.ts"), "B", "utf8");
    const result = await buildContextBlock(["a.ts", "b.ts"], dir);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
  });
});

describe("listRepoFiles", () => {
  it("lists files in the root", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await writeFile(join(dir, "foo.ts"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).toContain("foo.ts");
  });

  it("recurses into subdirectories", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "bar.ts"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).toContain("src/bar.ts");
  });

  it("skips node_modules", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await mkdir(join(dir, "node_modules"));
    await writeFile(join(dir, "node_modules", "pkg.js"), "", "utf8");
    const files = await listRepoFiles(dir);
    expect(files).not.toContain("node_modules/pkg.js");
  });

  it("does NOT filter gitignored paths by default (current behavior preserved)", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await writeFile(join(dir, ".gitignore"), "secret.txt\n", "utf8");
    await writeFile(join(dir, "secret.txt"), "", "utf8");
    await writeFile(join(dir, "keep.ts"), "", "utf8");
    const files = await listRepoFiles(dir); // respectGitignore defaults off
    expect(files).toContain("secret.txt");
    expect(files).toContain("keep.ts");
  });

  it("excludes gitignored paths when respectGitignore is on", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-at-"));
    await writeFile(join(dir, ".gitignore"), "secret.txt\nbuild/\n", "utf8");
    await writeFile(join(dir, "secret.txt"), "", "utf8");
    await writeFile(join(dir, "keep.ts"), "", "utf8");
    await mkdir(join(dir, "build"));
    await writeFile(join(dir, "build", "out.js"), "", "utf8");
    // The consumer reads the resolver — an unset setting resolves to true.
    const files = await listRepoFiles(dir, 3, shouldRespectGitignore({}));
    expect(files).not.toContain("secret.txt");
    expect(files).not.toContain("build/out.js");
    expect(files).toContain("keep.ts");
  });
});

describe("parseGitignore", () => {
  it("matches exact names and ignores comments/blank/negation lines", () => {
    const ignored = parseGitignore("# a comment\n\nsecret.txt\n!keep.txt\n");
    expect(ignored("secret.txt")).toBe(true);
    expect(ignored("other.txt")).toBe(false);
  });

  it("matches a directory pattern against path segments", () => {
    const ignored = parseGitignore("dist/\n");
    expect(ignored("dist")).toBe(true);
    expect(ignored("dist/bundle.js")).toBe(true);
    expect(ignored("src/index.ts")).toBe(false);
  });

  it("supports a single-segment glob", () => {
    const ignored = parseGitignore("*.log\n");
    expect(ignored("app.log")).toBe(true);
    expect(ignored("app.ts")).toBe(false);
  });
});
