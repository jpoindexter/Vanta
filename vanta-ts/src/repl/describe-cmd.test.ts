import { describe as suite, it, expect } from "vitest";
import {
  gatherTarget,
  buildDescribePrompt,
  describe,
  describeCmd,
  MAX_DIR_ENTRIES,
  MAX_FILE_BYTES,
  type DescribeFs,
  type DescribeTarget,
} from "./describe-cmd.js";
import type { ReplCtx } from "./types.js";

/** Build a fake fs over an in-memory tree: dirs map name→entries, files map path→content. */
function fakeFs(opts: {
  dirs?: Record<string, { name: string; isDir: boolean }[]>;
  files?: Record<string, string>;
}): DescribeFs {
  const dirs = opts.dirs ?? {};
  const files = opts.files ?? {};
  return {
    stat: async (p) => {
      if (p in dirs) return { isDirectory: () => true };
      if (p in files) return { isDirectory: () => false };
      throw new Error("ENOENT");
    },
    readdir: async (p) => dirs[p] ?? [],
    readFile: async (p) => files[p] ?? "",
  };
}

suite("gatherTarget", () => {
  it("lists a directory's entries (sorted)", async () => {
    const fs = fakeFs({
      dirs: { "/r/dir": [{ name: "z.ts", isDir: false }, { name: "a", isDir: true }] },
    });
    const r = await gatherTarget("/r/dir", fs);
    expect(r.ok).toBe(true);
    const t = (r as { value: DescribeTarget }).value;
    expect(t.kind).toBe("dir");
    expect(t.kind === "dir" && t.entries.map((e) => e.name)).toEqual(["a", "z.ts"]);
  });

  it("reads a bounded head of a file", async () => {
    const big = "x".repeat(MAX_FILE_BYTES + 500);
    const fs = fakeFs({ files: { "/r/big.ts": big } });
    const r = await gatherTarget("/r/big.ts", fs);
    expect(r.ok).toBe(true);
    const t = (r as { value: DescribeTarget }).value;
    expect(t.kind === "file" && t.content.length).toBe(MAX_FILE_BYTES);
    expect(t.kind === "file" && t.truncated).toBe(true);
  });

  it("truncates a directory over the entry cap", async () => {
    const many = Array.from({ length: MAX_DIR_ENTRIES + 10 }, (_, i) => ({ name: `f${i}`, isDir: false }));
    const fs = fakeFs({ dirs: { "/r/many": many } });
    const r = await gatherTarget("/r/many", fs);
    const t = (r as { value: DescribeTarget }).value;
    expect(t.kind === "dir" && t.entries.length).toBe(MAX_DIR_ENTRIES);
    expect(t.kind === "dir" && t.truncated).toBe(true);
  });

  it("returns an error value for a missing path", async () => {
    const r = await gatherTarget("/r/nope", fakeFs({}));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("path not found");
  });
});

suite("buildDescribePrompt", () => {
  it("includes directory entries with trailing slash for subdirs", () => {
    const prompt = buildDescribePrompt({
      kind: "dir",
      path: "/r/src",
      entries: [{ name: "index.ts", isDir: false }, { name: "tools", isDir: true }],
      truncated: false,
    });
    expect(prompt).toContain("/r/src");
    expect(prompt).toContain("- index.ts");
    expect(prompt).toContain("- tools/");
    expect(prompt).not.toContain("omitted");
  });

  it("includes file content and notes truncation", () => {
    const prompt = buildDescribePrompt({
      kind: "file",
      path: "/r/a.ts",
      content: "export const x = 1;",
      truncated: true,
    });
    expect(prompt).toContain("export const x = 1;");
    expect(prompt).toContain("file truncated");
  });
});

suite("describe", () => {
  it("injects the LLM call and returns its trimmed text (dir)", async () => {
    const fs = fakeFs({ dirs: { "/r/d": [{ name: "a.ts", isDir: false }] } });
    let seen = "";
    const r = await describe("/r/d", {
      fs,
      complete: async (prompt) => {
        seen = prompt;
        return "  A folder with one TS file.  ";
      },
    });
    expect(r.ok && r.value).toBe("A folder with one TS file.");
    expect(seen).toContain("- a.ts"); // a dir → entries reached the prompt
  });

  it("passes bounded file content to the injected LLM call", async () => {
    const fs = fakeFs({ files: { "/r/a.ts": "console.log(1)" } });
    let seen = "";
    const r = await describe("/r/a.ts", {
      fs,
      complete: async (prompt) => {
        seen = prompt;
        return "Logs a number.";
      },
    });
    expect(r.ok && r.value).toBe("Logs a number.");
    expect(seen).toContain("console.log(1)"); // a file → bounded content in the prompt
  });

  it("surfaces a gather error without calling the LLM", async () => {
    let called = false;
    const r = await describe("/r/missing", {
      fs: fakeFs({}),
      complete: async () => {
        called = true;
        return "x";
      },
    });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("falls back when the LLM returns empty text", async () => {
    const fs = fakeFs({ files: { "/r/a.ts": "x" } });
    const r = await describe("/r/a.ts", { fs, complete: async () => "   " });
    expect(r.ok && r.value).toBe("(no description returned)");
  });
});

suite("/describe handler", () => {
  function ctxFor(complete: (m: { role: string; content: string }[]) => { text: string }): ReplCtx {
    return {
      dataDir: "/repo/.vanta",
      setup: { provider: { complete: async (msgs: { role: string; content: string }[]) => complete(msgs) } },
    } as unknown as ReplCtx;
  }

  it("rejects an empty path with usage", async () => {
    const r = await describeCmd("  ", {} as ReplCtx);
    expect(r.output).toContain("usage: /describe");
  });

  it("refuses an out-of-scope path before any LLM call", async () => {
    let called = false;
    const ctx = ctxFor(() => {
      called = true;
      return { text: "x" };
    });
    const r = await describeCmd("../../etc/passwd", ctx);
    expect(r.output).toContain("outside scope");
    expect(called).toBe(false);
  });
});
