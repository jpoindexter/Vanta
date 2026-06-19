import { describe, it, expect } from "vitest";
import {
  densifySearchResult,
  undensify,
  shouldDensifyTool,
} from "./search-densify.js";

/** Build N grep-shaped lines under one path. */
function grepBlock(path: string, count: number, content = (i: number) => `match ${i}`): string {
  return Array.from({ length: count }, (_, i) => `${path}:${i + 1}:${content(i)}`).join("\n");
}

describe("densifySearchResult — fires only on >= 5 matches", () => {
  it("leaves output with 4 matches untouched (below threshold)", () => {
    const out = grepBlock("src/a.ts", 4);
    const r = densifySearchResult(out);
    expect(r.output).toBe(out);
    expect(r.tokensSaved).toBe(0);
  });

  it("densifies output with exactly 5 same-path matches", () => {
    const out = grepBlock("src/some/long/path/to/file.ts", 5);
    const r = densifySearchResult(out);
    expect(r.output).not.toBe(out);
    expect(r.tokensSaved).toBeGreaterThan(0);
    // header written once, then indented `line: content`
    const lines = r.output.split("\n");
    expect(lines[0]).toBe("src/some/long/path/to/file.ts");
    expect(lines[1]).toBe("  1: match 0");
    expect(lines[5]).toBe("  5: match 4");
  });

  it("counts matches across multiple paths toward the >=5 threshold but only groups runs of >=5", () => {
    // 3 + 3 = 6 total matches, but neither run reaches 5 → no grouping, no shrink.
    const out = [grepBlock("a.ts", 3), grepBlock("b.ts", 3)].join("\n");
    const r = densifySearchResult(out);
    expect(r.output).toBe(out);
    expect(r.tokensSaved).toBe(0);
  });
});

describe("densifySearchResult — lossless round-trip via undensify", () => {
  // The contract: undensify(densify(x)) === x, byte-for-byte, for every input.
  const cases: Record<string, string> = {
    "ascii matches": grepBlock("src/index.ts", 8),
    "unicode content": grepBlock("src/café.ts", 6, (i) => `café ☕ münü 日本語 ${i} — emoji 🚀`),
    "unicode in path": grepBlock("src/日本/файл.ts", 6, (i) => `value ${i}`),
    "colons in content": grepBlock("src/x.ts", 6, (i) => `key: value: ${i}: more:colons`),
    "content that looks like a path:line": grepBlock("src/y.ts", 6, (i) => `other.ts:${i}:nested match`),
    "quotes in content": grepBlock("src/q.ts", 6, (i) => `he said "hello" and 'world' \`back\` ${i}`),
    "empty content after colon": grepBlock("src/empty.ts", 6, () => ""),
    "trailing whitespace": grepBlock("src/ws.ts", 6, (i) => `trailing spaces ${i}   \t`),
    "leading whitespace in content": grepBlock("src/lead.ts", 6, (i) => `    indented code ${i}`),
    "tabs in content": grepBlock("src/tab.ts", 6, (i) => `col1\tcol2\t${i}`),
    "multiple groups": [grepBlock("a/a.ts", 6), grepBlock("b/b.ts", 7), grepBlock("c/c.ts", 5)].join("\n"),
    "mixed grouped + ungrouped (short run interleaved)": [
      grepBlock("big.ts", 6),
      grepBlock("small.ts", 2),
      grepBlock("big2.ts", 5),
    ].join("\n"),
    "header-like lines and (no matches) preserved": [
      "(no matches)",
      grepBlock("src/z.ts", 6),
      "some trailing note",
    ].join("\n"),
    "high line numbers": grepBlock("src/h.ts", 6, (i) => `n=${i}`).replace(/:(\d+):/g, (_m, n) => `:${Number(n) * 100000}:`),
  };

  for (const [name, input] of Object.entries(cases)) {
    it(`round-trips exactly: ${name}`, () => {
      const { output } = densifySearchResult(input);
      expect(undensify(output)).toBe(input);
    });
  }

  it("preserves every line number exactly after densify+undensify", () => {
    const input = grepBlock("src/lines.ts", 12, (i) => `body ${i}`);
    const { output } = densifySearchResult(input);
    const restored = undensify(output);
    // every original "path:N:" line-number token survives
    const origNums = [...input.matchAll(/:(\d+):/g)].map((m) => m[1]);
    const backNums = [...restored.matchAll(/:(\d+):/g)].map((m) => m[1]);
    expect(backNums).toEqual(origNums);
    expect(restored).toBe(input);
  });

  it("preserves a trailing newline byte exactly", () => {
    const input = grepBlock("src/tn.ts", 6) + "\n";
    const { output } = densifySearchResult(input);
    expect(undensify(output)).toBe(input);
  });
});

describe("densifySearchResult — safety / no-op cases", () => {
  it("never throws and returns input on empty string", () => {
    expect(densifySearchResult("").output).toBe("");
  });

  it("leaves non-grep output untouched (ranked snippets)", () => {
    const ranked = Array.from({ length: 8 }, (_, i) => `[0.${i}] world.jsonl: snippet ${i}`).join("\n");
    const r = densifySearchResult(ranked);
    expect(r.output).toBe(ranked);
    expect(r.tokensSaved).toBe(0);
  });

  it("leaves bare-path glob output untouched (no line:content)", () => {
    const paths = Array.from({ length: 8 }, (_, i) => `src/dir/file-${i}.ts`).join("\n");
    const r = densifySearchResult(paths);
    expect(r.output).toBe(paths);
    expect(r.tokensSaved).toBe(0);
  });

  it("declines to corrupt a path that embeds :line: framing (round-trip guard)", () => {
    // A path literally containing `:5:` would re-expand ambiguously; the guard
    // must return the input untouched rather than emit a lossy grouping.
    const tricky = Array.from({ length: 6 }, (_, i) => `weird:5:path.ts:${i + 1}:content ${i}`).join("\n");
    const r = densifySearchResult(tricky);
    expect(undensify(r.output)).toBe(tricky); // lossless regardless of whether grouped
  });
});

describe("undensify — standalone reversibility on hand-written densified text", () => {
  it("expands a header + indented body back to flat lines", () => {
    const dense = ["src/a.ts", "  1: foo", "  2: bar", "  3: baz"].join("\n");
    expect(undensify(dense)).toBe(["src/a.ts:1:foo", "src/a.ts:2:bar", "src/a.ts:3:baz"].join("\n"));
  });

  it("passes through flat (already-expanded) match lines unchanged", () => {
    const flat = grepBlock("src/a.ts", 3);
    expect(undensify(flat)).toBe(flat);
  });
});

describe("shouldDensifyTool", () => {
  it("targets grep_files", () => expect(shouldDensifyTool("grep_files")).toBe(true));
  it("does not target glob_files (bare paths)", () => expect(shouldDensifyTool("glob_files")).toBe(false));
  it("does not target code_search / life_search (ranked shape)", () => {
    expect(shouldDensifyTool("code_search")).toBe(false);
    expect(shouldDensifyTool("life_search")).toBe(false);
  });
  it("does not target precision reads", () => {
    expect(shouldDensifyTool("read_file")).toBe(false);
    expect(shouldDensifyTool("git_diff")).toBe(false);
  });
});
