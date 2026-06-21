import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildFileIndex,
  queryFileIndex,
  FileIndexHolder,
  getFileIndex,
  invalidateFileIndex,
  DEFAULT_MAX_RESULTS,
  type FileIndexDeps,
} from "./file-index.js";

/** An injected walk that returns a fixed path list, counting invocations. */
function fakeWalk(paths: readonly string[]): {
  deps: FileIndexDeps;
  calls: () => number;
} {
  const walk = vi.fn((_root: string) => paths);
  return { deps: { walk, root: "/repo" }, calls: () => walk.mock.calls.length };
}

describe("buildFileIndex (noise filter + basename indexing)", () => {
  it("indexes plain in-repo files with their basename", () => {
    const index = buildFileIndex(["src/ui/app.tsx", "README.md"]);
    expect(index.files.map((f) => f.path)).toEqual(["src/ui/app.tsx", "README.md"]);
    expect(index.files[0]!.basename).toBe("app.tsx");
    expect(index.files[1]!.basename).toBe("readme.md");
  });

  it("drops node_modules / .git / dist / .vanta subtrees", () => {
    const index = buildFileIndex([
      "src/keep.ts",
      "node_modules/pkg/index.js",
      ".git/config",
      "dist/bundle.js",
      ".vanta/goals.tsv",
    ]);
    expect(index.files.map((f) => f.path)).toEqual(["src/keep.ts"]);
  });

  it("drops any dotfile-DIR segment but keeps a dotfile leaf", () => {
    const index = buildFileIndex([
      ".cache/x.ts", // dotfile dir → dropped
      "src/.hidden/y.ts", // nested dotfile dir → dropped
      ".env.example", // dotfile leaf → kept
      "src/.eslintrc.json", // dotfile leaf in a real dir → kept
    ]);
    expect(index.files.map((f) => f.path)).toEqual([".env.example", "src/.eslintrc.json"]);
  });

  it("yields an empty index for empty or fully-filtered input", () => {
    expect(buildFileIndex([]).files).toEqual([]);
    expect(buildFileIndex(["node_modules/a.js"]).files).toEqual([]);
  });
});

describe("queryFileIndex (rank + cap + case-insensitivity)", () => {
  const index = buildFileIndex([
    "src/ui/app.tsx", // basename "app.tsx"
    "src/lib/myapp.ts", // basename contains "app"
    "docs/application-notes.md", // path contains "app", basename starts "app"
    "src/components/Button.tsx", // path contains "app"? no
    "src/app-shell/index.ts", // path contains "app", basename "index.ts"
  ]);

  it("ranks basename-startsWith above basename-contains above path-contains", () => {
    const out = queryFileIndex(index, "app");
    // basename-startsWith: app.tsx, application-notes.md (tie → shorter path first)
    // then basename-contains: myapp.ts
    // then path-contains: app-shell/index.ts
    expect(out).toEqual([
      "src/ui/app.tsx",
      "docs/application-notes.md",
      "src/lib/myapp.ts",
      "src/app-shell/index.ts",
    ]);
  });

  it("matches on path substring when the basename does not match", () => {
    expect(queryFileIndex(index, "components")).toEqual(["src/components/Button.tsx"]);
  });

  it("is case-insensitive on both fragment and path", () => {
    expect(queryFileIndex(index, "BUTTON")).toEqual(["src/components/Button.tsx"]);
  });

  it("breaks rank ties by shorter path, then path ascending", () => {
    const tie = buildFileIndex(["z/app.ts", "a/app.ts", "app.ts"]);
    // all basename-startsWith "app" → shortest path first, then localeCompare
    expect(queryFileIndex(tie, "app")).toEqual(["app.ts", "a/app.ts", "z/app.ts"]);
  });

  it("returns the first N for an empty / whitespace fragment", () => {
    expect(queryFileIndex(index, "")).toEqual(index.files.slice(0, DEFAULT_MAX_RESULTS).map((f) => f.path));
    expect(queryFileIndex(index, "   ", 2)).toEqual([index.files[0]!.path, index.files[1]!.path]);
  });

  it("caps results at max", () => {
    const many = buildFileIndex(Array.from({ length: 50 }, (_v, i) => `src/app${i}.ts`));
    expect(queryFileIndex(many, "app", 5)).toHaveLength(5);
    expect(queryFileIndex(many, "app")).toHaveLength(DEFAULT_MAX_RESULTS);
  });

  it("returns [] when nothing matches", () => {
    expect(queryFileIndex(index, "zzznope")).toEqual([]);
  });

  it("returns [] for any query against an empty index", () => {
    const empty = buildFileIndex([]);
    expect(queryFileIndex(empty, "app")).toEqual([]);
    expect(queryFileIndex(empty, "")).toEqual([]);
  });
});

describe("FileIndexHolder (lazy build-once + invalidate)", () => {
  it("builds once and caches across repeated get calls (walk called once)", () => {
    const holder = new FileIndexHolder();
    const { deps, calls } = fakeWalk(["src/a.ts"]);
    const first = holder.get(deps);
    const second = holder.get(deps);
    expect(first).toBe(second);
    expect(calls()).toBe(1);
  });

  it("rebuilds after invalidate so a new file is picked up", () => {
    let paths: readonly string[] = ["src/a.ts"];
    const walk = vi.fn((_root: string) => paths);
    const deps: FileIndexDeps = { walk, root: "/repo" };
    const holder = new FileIndexHolder();

    expect(holder.get(deps).files.map((f) => f.path)).toEqual(["src/a.ts"]);
    paths = ["src/a.ts", "src/b.ts"];
    expect(holder.get(deps).files.map((f) => f.path)).toEqual(["src/a.ts"]); // still cached
    holder.invalidate();
    expect(holder.get(deps).files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(walk).toHaveBeenCalledTimes(2);
  });

  it("yields an empty index (never throws) when walk throws", () => {
    const holder = new FileIndexHolder();
    const walk = vi.fn(() => {
      throw new Error("EACCES");
    });
    const deps: FileIndexDeps = { walk, root: "/repo" };
    expect(() => holder.get(deps)).not.toThrow();
    expect(holder.get(deps).files).toEqual([]);
    expect(queryFileIndex(holder.get(deps), "app")).toEqual([]);
  });
});

describe("module-level getFileIndex / invalidateFileIndex", () => {
  afterEach(() => invalidateFileIndex());

  it("builds once across two getFileIndex calls then rebuilds after invalidate", () => {
    let paths: readonly string[] = ["src/a.ts"];
    const walk = vi.fn((_root: string) => paths);
    const deps: FileIndexDeps = { walk, root: "/repo" };

    const a = getFileIndex(deps);
    const b = getFileIndex(deps);
    expect(a).toBe(b);
    expect(walk).toHaveBeenCalledTimes(1);

    paths = ["src/a.ts", "src/b.ts"];
    invalidateFileIndex();
    expect(getFileIndex(deps).files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(walk).toHaveBeenCalledTimes(2);
  });
});
