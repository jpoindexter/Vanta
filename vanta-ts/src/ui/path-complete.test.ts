import { describe, it, expect } from "vitest";
import {
  splitPathPartial,
  commonPrefix,
  completePath,
  formatPathCandidates,
  type DirListing,
} from "./path-complete.js";

/** Build an injected lister that returns a fixed listing for any dir. */
function lister(entries: string[]): { listDir: (dir: string) => DirListing } {
  return { listDir: () => ({ entries }) };
}

describe("splitPathPartial", () => {
  it("treats a bare token as a prefix in the current dir", () => {
    expect(splitPathPartial("foo")).toEqual({ dir: ".", prefix: "foo" });
  });

  it("treats an empty input as the current dir with no prefix", () => {
    expect(splitPathPartial("")).toEqual({ dir: ".", prefix: "" });
  });

  it("splits a ./ relative path keeping the dir shape", () => {
    expect(splitPathPartial("./src/comp")).toEqual({ dir: "./src/", prefix: "comp" });
  });

  it("splits a ~ home path keeping the tilde", () => {
    expect(splitPathPartial("~/Down")).toEqual({ dir: "~/", prefix: "Down" });
  });

  it("treats a bare ~ as a prefix (no separator)", () => {
    expect(splitPathPartial("~")).toEqual({ dir: ".", prefix: "~" });
  });

  it("splits an absolute path", () => {
    expect(splitPathPartial("/usr/lo")).toEqual({ dir: "/usr/", prefix: "lo" });
  });

  it("lists the root for a single leading slash", () => {
    expect(splitPathPartial("/et")).toEqual({ dir: "/", prefix: "et" });
  });

  it("has an empty prefix for a trailing-separator path", () => {
    expect(splitPathPartial("src/")).toEqual({ dir: "src/", prefix: "" });
  });
});

describe("commonPrefix", () => {
  it("finds the longest shared prefix", () => {
    expect(commonPrefix(["foobar", "foobaz"])).toBe("fooba");
  });

  it("returns the single string when only one given", () => {
    expect(commonPrefix(["only"])).toBe("only");
  });

  it("returns empty for no inputs", () => {
    expect(commonPrefix([])).toBe("");
  });

  it("returns empty when there is no overlap", () => {
    expect(commonPrefix(["abc", "xyz"])).toBe("");
  });

  it("clamps to the shortest string", () => {
    expect(commonPrefix(["src/", "src/app", "src/api"])).toBe("src/a".slice(0, 4));
  });
});

describe("completePath", () => {
  it("filters candidates by the typed prefix", () => {
    const r = completePath("comp", lister(["composer.tsx", "compute.ts", "banner.tsx"]));
    expect(r.candidates).toEqual(["composer.tsx", "compute.ts"]);
  });

  it("fills the full name on a single match", () => {
    const r = completePath("comp", lister(["composer.tsx", "banner.tsx"]));
    expect(r.candidates).toEqual(["composer.tsx"]);
    expect(r.completion).toBe("composer.tsx");
  });

  it("fills the common prefix when several entries share more", () => {
    // Both share "compose" -> longer than the typed "comp" -> fill to "compose".
    const r = completePath("comp", lister(["composer.tsx", "compose.ts"]));
    expect(r.completion).toBe("compose");
  });

  it("keeps directory entries suffixed with / from the lister", () => {
    const r = completePath("s", lister(["src/", "scripts/", "setup.ts"]));
    expect(r.candidates).toEqual(["src/", "scripts/", "setup.ts"]);
    // "src/", "scripts/", "setup.ts" share only "s" -> equals prefix -> no fill.
    expect(r.completion).toBeNull();
  });

  it("fills a single directory match including its trailing slash", () => {
    const r = completePath("sr", lister(["src/", "setup.ts"]));
    expect(r.candidates).toEqual(["src/"]);
    expect(r.completion).toBe("src/");
  });

  it("preserves the dir portion when completing inside a directory", () => {
    const r = completePath("src/comp", lister(["composer.tsx", "compose.ts"]));
    expect(r.candidates).toEqual(["composer.tsx", "compose.ts"]);
    expect(r.completion).toBe("src/compose");
  });

  it("preserves a single match's dir portion", () => {
    const r = completePath("./src/comp", lister(["composer.tsx"]));
    expect(r.completion).toBe("./src/composer.tsx");
  });

  it("returns no completion when nothing matches", () => {
    const r = completePath("zzz", lister(["composer.tsx", "banner.tsx"]));
    expect(r.candidates).toEqual([]);
    expect(r.completion).toBeNull();
  });

  it("returns no completion when the shared prefix equals what is typed", () => {
    // Both start with "comp" already typed; nothing more to fill (ambiguous).
    const r = completePath("comp", lister(["compare.ts", "complete.ts"]));
    expect(r.candidates).toEqual(["compare.ts", "complete.ts"]);
    expect(r.completion).toBeNull();
  });

  it("treats a listDir failure as empty (never throws)", () => {
    const deps = {
      listDir: () => {
        throw new Error("EACCES");
      },
    };
    const r = completePath("comp", deps);
    expect(r.candidates).toEqual([]);
    expect(r.completion).toBeNull();
  });

  it("uses the injected lister, not the real filesystem", () => {
    let seenDir = "";
    const r = completePath("~/Doc", {
      listDir: (dir) => {
        seenDir = dir;
        return { entries: ["Documents/", "Downloads/"] };
      },
    });
    expect(seenDir).toBe("~/"); // listed the partial's dir, not cwd
    // Only "Documents/" starts with "Doc" -> single match, dir prefix preserved.
    expect(r.candidates).toEqual(["Documents/"]);
    expect(r.completion).toBe("~/Documents/");
  });

  it("fills the shared prefix past the typed text preserving the home dir", () => {
    // "Documents/" & "Downloads/" share "Do" -> equals typed "D", fills one char.
    const r = completePath("~/D", lister(["Documents/", "Downloads/"]));
    expect(r.candidates).toEqual(["Documents/", "Downloads/"]);
    expect(r.completion).toBe("~/Do");
  });

  it("matches the prefix literally (no glob expansion)", () => {
    // A literal `*` prefix matches only a name that literally starts with `*`.
    const r = completePath("*", lister(["star.ts", "*literal", "other.ts"]));
    expect(r.candidates).toEqual(["*literal"]);
    expect(r.completion).toBe("*literal");
  });
});

describe("formatPathCandidates", () => {
  it("renders a compact ▸-prefixed list", () => {
    expect(formatPathCandidates(["src/", "setup.ts"])).toBe("▸ src/\n▸ setup.ts");
  });

  it("renders empty for no candidates", () => {
    expect(formatPathCandidates([])).toBe("");
  });
});
