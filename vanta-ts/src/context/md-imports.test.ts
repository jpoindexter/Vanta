import { describe, it, expect } from "vitest";
import { resolve, isAbsolute } from "node:path";
import { resolveImports, type ReadFile } from "./md-imports.js";

/**
 * Build an injected readFile from a virtual filesystem keyed by absolute path.
 * A key absent from the map → null (missing file), matching the resolver's
 * errors-as-values contract.
 */
function fakeReader(files: Record<string, string>): ReadFile {
  const abs: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) abs[isAbsolute(k) ? k : resolve(k)] = v;
  return async (path) => (path in abs ? abs[path]! : null);
}

const BASE = "/proj";

describe("resolveImports", () => {
  it("leaves text without any @import unchanged", async () => {
    const text = "# VANTA.md\nNo imports here. email@nowhere is not a path.";
    const out = await resolveImports(text, fakeReader({}), { baseDir: BASE });
    // No `@token` matches the path char class as a bare ref → text is identical.
    expect(out).toBe(text);
  });

  it("inlines a single relative import against baseDir", async () => {
    const read = fakeReader({ "/proj/rules.md": "RULES BODY" });
    const out = await resolveImports("before @rules.md after", read, { baseDir: BASE });
    expect(out).toBe("before RULES BODY after");
  });

  it("resolves a relative import within a subdirectory", async () => {
    const read = fakeReader({ "/proj/docs/style.md": "STYLE" });
    const out = await resolveImports("@docs/style.md", read, { baseDir: BASE });
    expect(out).toBe("STYLE");
  });

  it("inlines an absolute import path", async () => {
    const read = fakeReader({ "/etc/global-rules.md": "GLOBAL" });
    const out = await resolveImports("x @/etc/global-rules.md y", read, { baseDir: BASE });
    expect(out).toBe("x GLOBAL y");
  });

  it("recursively resolves imports inside imported files", async () => {
    const read = fakeReader({
      "/proj/a.md": "A[@b.md]",
      "/proj/b.md": "B[@c.md]",
      "/proj/c.md": "C",
    });
    const out = await resolveImports("@a.md", read, { baseDir: BASE });
    expect(out).toBe("A[B[C]]");
  });

  it("resolves a nested file's relative import against that file's own dir", async () => {
    const read = fakeReader({
      "/proj/a.md": "A:@nested/b.md",
      "/proj/nested/b.md": "B:@c.md", // relative to /proj/nested, not /proj
      "/proj/nested/c.md": "C",
    });
    const out = await resolveImports("@a.md", read, { baseDir: BASE });
    expect(out).toBe("A:B:C");
  });

  it("stops at the 4-hop cap (depth 5), leaving deeper tokens in place", async () => {
    // Chain: root -> 1 -> 2 -> 3 -> 4 -> 5. maxHops=4 means files 1..4 inline
    // (depths 1..4) but file 4's `@5.md` (which would be depth 5) is left as-is.
    const read = fakeReader({
      "/proj/1.md": "1>@2.md",
      "/proj/2.md": "2>@3.md",
      "/proj/3.md": "3>@4.md",
      "/proj/4.md": "4>@5.md",
      "/proj/5.md": "5",
    });
    const out = await resolveImports("@1.md", read, { baseDir: BASE });
    expect(out).toBe("1>2>3>4>@5.md");
    expect(out).not.toContain("5\n");
  });

  it("skips a direct cycle A→B→A without looping", async () => {
    const read = fakeReader({
      "/proj/a.md": "A[@b.md]",
      "/proj/b.md": "B[@a.md]", // back to a → cycle, skipped
    });
    const out = await resolveImports("@a.md", read, { baseDir: BASE });
    expect(out).toBe("A[B[@a.md]]");
  });

  it("skips a self-import without looping", async () => {
    const read = fakeReader({ "/proj/self.md": "S[@self.md]" });
    const out = await resolveImports("@self.md", read, { baseDir: BASE });
    expect(out).toBe("S[@self.md]");
  });

  it("skips a missing import, leaving the @path token in place", async () => {
    const out = await resolveImports("keep @nope.md here", fakeReader({}), { baseDir: BASE });
    expect(out).toBe("keep @nope.md here");
  });

  it("inlines present imports while skipping missing ones in the same text", async () => {
    const read = fakeReader({ "/proj/here.md": "PRESENT" });
    const out = await resolveImports("@here.md and @gone.md", read, { baseDir: BASE });
    expect(out).toBe("PRESENT and @gone.md");
  });

  it("handles multiple imports on one line", async () => {
    const read = fakeReader({ "/proj/x.md": "X", "/proj/y.md": "Y" });
    const out = await resolveImports("@x.md @y.md", read, { baseDir: BASE });
    expect(out).toBe("X Y");
  });

  it("respects a custom maxHops of 1 (only the top level inlines)", async () => {
    const read = fakeReader({ "/proj/a.md": "A>@b.md", "/proj/b.md": "B" });
    const out = await resolveImports("@a.md", read, { baseDir: BASE, maxHops: 1 });
    expect(out).toBe("A>@b.md");
  });
});
