import { describe, expect, it, vi } from "vitest";
import {
  isSafeAssetName,
  listSkillAssets,
  planAssetExtraction,
  extractSkillAssets,
  type ExtractDeps,
} from "./file-assets.js";

describe("isSafeAssetName", () => {
  it("accepts plain filenames", () => {
    expect(isSafeAssetName("helper.py")).toBe(true);
    expect(isSafeAssetName("template.md")).toBe(true);
    expect(isSafeAssetName(".gitkeep")).toBe(true);
  });

  it("rejects traversal, nested, and absolute paths", () => {
    expect(isSafeAssetName("..")).toBe(false);
    expect(isSafeAssetName(".")).toBe(false);
    expect(isSafeAssetName("../escape.sh")).toBe(false);
    expect(isSafeAssetName("sub/dir/file.txt")).toBe(false);
    expect(isSafeAssetName("/etc/passwd")).toBe(false);
    expect(isSafeAssetName("..\\windows")).toBe(false);
    expect(isSafeAssetName("C:foo")).toBe(false);
    expect(isSafeAssetName("")).toBe(false);
  });
});

describe("listSkillAssets", () => {
  it("returns every file except SKILL.md", () => {
    const entries = ["SKILL.md", "helper.py", "template.md", "ref.txt"];
    expect(listSkillAssets(entries).sort()).toEqual([
      "helper.py",
      "ref.txt",
      "template.md",
    ]);
  });

  it("returns [] for a skill with no companion files", () => {
    expect(listSkillAssets(["SKILL.md"])).toEqual([]);
    expect(listSkillAssets([])).toEqual([]);
  });

  it("filters out traversal/nested/absolute entries (security)", () => {
    const entries = ["SKILL.md", "ok.py", "../evil", "nested/x", "/abs"];
    expect(listSkillAssets(entries)).toEqual(["ok.py"]);
  });
});

describe("planAssetExtraction", () => {
  it("returns only assets missing from the destination (skip-if-present)", () => {
    const src = ["SKILL.md", "a.py", "b.md", "c.txt"];
    const dest = ["SKILL.md", "b.md"]; // b.md already extracted
    expect(planAssetExtraction(src, dest).sort()).toEqual(["a.py", "c.txt"]);
  });

  it("is idempotent — a re-run after extraction plans nothing", () => {
    const src = ["SKILL.md", "a.py", "b.md"];
    const firstPass = planAssetExtraction(src, ["SKILL.md"]);
    expect(firstPass.sort()).toEqual(["a.py", "b.md"]);
    // dest now contains the just-extracted assets
    const dest = ["SKILL.md", ...firstPass];
    expect(planAssetExtraction(src, dest)).toEqual([]);
  });

  it("plans nothing for a no-companion-files skill", () => {
    expect(planAssetExtraction(["SKILL.md"], ["SKILL.md"])).toEqual([]);
  });

  it("never plans a traversal entry even if absent from dest", () => {
    expect(planAssetExtraction(["SKILL.md", "../evil"], ["SKILL.md"])).toEqual(
      [],
    );
  });
});

describe("extractSkillAssets", () => {
  const deps = (over: Partial<ExtractDeps>): ExtractDeps => ({
    listSrc: async () => ["SKILL.md", "a.py", "b.md"],
    listDest: async () => ["SKILL.md"],
    copy: async () => {},
    ...over,
  });

  it("copies the planned set and returns the extracted names", async () => {
    const copied: string[] = [];
    const out = await extractSkillAssets(
      deps({ copy: async (n) => void copied.push(n) }),
    );
    expect(out.sort()).toEqual(["a.py", "b.md"]);
    expect(copied.sort()).toEqual(["a.py", "b.md"]);
  });

  it("skips assets already present in the destination", async () => {
    const copied: string[] = [];
    const out = await extractSkillAssets(
      deps({
        listDest: async () => ["SKILL.md", "b.md"],
        copy: async (n) => void copied.push(n),
      }),
    );
    expect(out).toEqual(["a.py"]);
    expect(copied).toEqual(["a.py"]);
  });

  it("extracts nothing for a no-companion-files skill", async () => {
    const copy = vi.fn(async () => {});
    const out = await extractSkillAssets(
      deps({ listSrc: async () => ["SKILL.md"], copy }),
    );
    expect(out).toEqual([]);
    expect(copy).not.toHaveBeenCalled();
  });

  it("is best-effort — a copy failure skips that asset, never throws", async () => {
    const out = await extractSkillAssets(
      deps({
        copy: async (n) => {
          if (n === "a.py") throw new Error("EACCES");
        },
      }),
    );
    expect(out).toEqual(["b.md"]); // a.py failed → omitted; b.md still copied
  });

  it("returns [] (never throws) when the source dir is unreadable", async () => {
    const copy = vi.fn(async () => {});
    const out = await extractSkillAssets(
      deps({
        listSrc: async () => {
          throw new Error("ENOENT");
        },
        copy,
      }),
    );
    expect(out).toEqual([]);
    expect(copy).not.toHaveBeenCalled();
  });

  it("treats a missing destination dir as 'all assets absent'", async () => {
    const out = await extractSkillAssets(
      deps({
        listDest: async () => {
          throw new Error("ENOENT");
        },
      }),
    );
    expect(out.sort()).toEqual(["a.py", "b.md"]);
  });

  it("never copies a traversal entry from the source (security)", async () => {
    const copied: string[] = [];
    const out = await extractSkillAssets(
      deps({
        listSrc: async () => ["SKILL.md", "ok.py", "../evil"],
        copy: async (n) => void copied.push(n),
      }),
    );
    expect(out).toEqual(["ok.py"]);
    expect(copied).toEqual(["ok.py"]);
  });
});
