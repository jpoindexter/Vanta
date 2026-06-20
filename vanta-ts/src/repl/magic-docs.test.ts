import { describe, it, expect } from "vitest";
import {
  MAGIC_BEGIN,
  MAGIC_END,
  buildMagicSummary,
  replaceManagedRegion,
  updateMagicDocs,
  resolveMagicDocs,
  type MagicSummaryInput,
  type MagicDocsFs,
} from "./magic-docs.js";

const TS = "2026-06-20T12:00:00.000Z";

function input(over: Partial<MagicSummaryInput> = {}): MagicSummaryInput {
  return {
    activeGoal: "Ship VANTA-MAGIC-DOCS",
    recentFiles: ["src/repl/magic-docs.ts"],
    lastAction: "write_file",
    timestamp: TS,
    ...over,
  };
}

describe("buildMagicSummary", () => {
  it("includes the active goal, recent files, last action, and timestamp", () => {
    const s = buildMagicSummary(input());
    expect(s).toContain("Ship VANTA-MAGIC-DOCS");
    expect(s).toContain("src/repl/magic-docs.ts");
    expect(s).toContain("write_file");
    expect(s).toContain(TS);
  });

  it("is pure — same input yields identical output, no clock read", () => {
    expect(buildMagicSummary(input())).toBe(buildMagicSummary(input()));
  });

  it("renders (none) for empty/null fields", () => {
    const s = buildMagicSummary(input({ activeGoal: null, recentFiles: [], lastAction: null }));
    expect(s).toContain("**Active goal:** (none)");
    expect(s).toContain("**Recent files:** (none)");
    expect(s).toContain("**Last action:** (none)");
  });

  it("caps recent files to the most recent N", () => {
    const many = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    const s = buildMagicSummary(input({ recentFiles: many }));
    expect(s).toContain("f19.ts"); // most recent kept
    expect(s).not.toContain("f0.ts"); // oldest dropped
  });

  it("does not embed the markers (replaceManagedRegion owns them)", () => {
    const s = buildMagicSummary(input());
    expect(s).not.toContain(MAGIC_BEGIN);
    expect(s).not.toContain(MAGIC_END);
  });
});

describe("replaceManagedRegion", () => {
  it("appends a wrapped region when markers are absent", () => {
    const out = replaceManagedRegion("# My Status\n\nHand-written.\n", "BODY");
    expect(out).toContain("# My Status");
    expect(out).toContain("Hand-written.");
    expect(out).toContain(`${MAGIC_BEGIN}\nBODY\n${MAGIC_END}`);
    // hand-written content precedes the appended block
    expect(out.indexOf("Hand-written.")).toBeLessThan(out.indexOf(MAGIC_BEGIN));
  });

  it("replaces only the content between markers, preserving content outside", () => {
    const existing = `TOP\n${MAGIC_BEGIN}\nOLD\n${MAGIC_END}\nBOTTOM\n`;
    const out = replaceManagedRegion(existing, "NEW");
    expect(out).toBe(`TOP\n${MAGIC_BEGIN}\nNEW\n${MAGIC_END}\nBOTTOM\n`);
    expect(out).not.toContain("OLD");
    expect(out).toContain("TOP");
    expect(out).toContain("BOTTOM");
  });

  it("is idempotent in shape — a second replace swaps the region, never nests", () => {
    const once = replaceManagedRegion("doc\n", "A");
    const twice = replaceManagedRegion(once, "B");
    // exactly one marker pair after two updates
    expect(twice.split(MAGIC_BEGIN).length - 1).toBe(1);
    expect(twice.split(MAGIC_END).length - 1).toBe(1);
    expect(twice).toContain("B");
    expect(twice).not.toContain("A");
    expect(twice).toContain("doc");
  });

  it("writes a bare block for empty content", () => {
    expect(replaceManagedRegion("", "BODY")).toBe(`${MAGIC_BEGIN}\nBODY\n${MAGIC_END}`);
  });

  it("preserves hand-written content above AND below the region across updates", () => {
    const initial = "HEADER\n\nnotes\n";
    const v1 = replaceManagedRegion(initial, "first");
    const withBottom = `${v1}\nFOOTER\n`;
    const v2 = replaceManagedRegion(withBottom, "second");
    expect(v2).toContain("HEADER");
    expect(v2).toContain("notes");
    expect(v2).toContain("FOOTER");
    expect(v2).toContain("second");
    expect(v2).not.toContain("first");
  });
});

describe("resolveMagicDocs", () => {
  it("returns [] when unset (no magic docs = no writes)", () => {
    expect(resolveMagicDocs({})).toEqual([]);
  });

  it("returns the configured paths, dropping blanks", () => {
    expect(resolveMagicDocs({ magicDocs: ["STATUS.md", "  ", "PROGRESS.md"] })).toEqual([
      "STATUS.md",
      "PROGRESS.md",
    ]);
  });
});

/** A fake in-memory fs for updateMagicDocs. */
function fakeFs(seed: Record<string, string> = {}): MagicDocsFs & { store: Record<string, string> } {
  const store: Record<string, string> = { ...seed };
  return {
    store,
    async readFile(path) {
      if (!(path in store)) throw new Error("ENOENT");
      return store[path]!;
    },
    async writeFile(path, content) {
      store[path] = content;
    },
  };
}

describe("updateMagicDocs", () => {
  it("writes nothing when the docs list is empty", async () => {
    const fs = fakeFs();
    const written = await updateMagicDocs([], "BODY", fs);
    expect(written).toEqual([]);
    expect(Object.keys(fs.store)).toEqual([]);
  });

  it("refreshes the managed region of each doc, preserving hand-written content", async () => {
    const fs = fakeFs({ "STATUS.md": "MINE\n", "PROGRESS.md": "ALSO MINE\n" });
    const written = await updateMagicDocs(["STATUS.md", "PROGRESS.md"], "SUMMARY", fs);
    expect(written).toEqual(["STATUS.md", "PROGRESS.md"]);
    expect(fs.store["STATUS.md"]).toContain("MINE");
    expect(fs.store["STATUS.md"]).toContain("SUMMARY");
    expect(fs.store["PROGRESS.md"]).toContain("ALSO MINE");
  });

  it("creates the region for a missing file (treated as empty)", async () => {
    const fs = fakeFs();
    const written = await updateMagicDocs(["NEW.md"], "SUMMARY", fs);
    expect(written).toEqual(["NEW.md"]);
    expect(fs.store["NEW.md"]).toBe(`${MAGIC_BEGIN}\nSUMMARY\n${MAGIC_END}`);
  });

  it("a second update replaces only the region (idempotent shape)", async () => {
    const fs = fakeFs({ "STATUS.md": "MINE\n" });
    await updateMagicDocs(["STATUS.md"], "FIRST", fs);
    await updateMagicDocs(["STATUS.md"], "SECOND", fs);
    const out = fs.store["STATUS.md"]!;
    expect(out.split(MAGIC_BEGIN).length - 1).toBe(1);
    expect(out).toContain("SECOND");
    expect(out).not.toContain("FIRST");
    expect(out).toContain("MINE");
  });

  it("is best-effort — a write failure on one doc never throws and isolates other docs", async () => {
    const fs = fakeFs({ "OK.md": "ok\n" });
    const guarded: MagicDocsFs = {
      readFile: fs.readFile,
      writeFile: async (path, content) => {
        if (path === "BAD.md") throw new Error("EACCES");
        await fs.writeFile(path, content);
      },
    };
    const written = await updateMagicDocs(["BAD.md", "OK.md"], "S", guarded);
    expect(written).toEqual(["OK.md"]); // BAD.md swallowed, OK.md still written
    expect(fs.store["OK.md"]).toContain("S");
  });

  it("skips a redundant write when content is unchanged", async () => {
    const fs = fakeFs();
    await updateMagicDocs(["DOC.md"], "BODY", fs);
    let writes = 0;
    const counting: MagicDocsFs = {
      readFile: fs.readFile,
      writeFile: async (p, c) => { writes++; await fs.writeFile(p, c); },
    };
    await updateMagicDocs(["DOC.md"], "BODY", counting);
    expect(writes).toBe(0); // identical region → no write
  });
});
