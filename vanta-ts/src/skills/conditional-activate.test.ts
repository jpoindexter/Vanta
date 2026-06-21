import { describe, it, expect } from "vitest";
import {
  parseActivateGlobs,
  matchGlob,
  pathActivates,
  skillsForEditedPath,
  type SkillGlobs,
} from "./conditional-activate.js";

describe("parseActivateGlobs", () => {
  it("absent activateOn => [] (never path-activated)", () => {
    expect(parseActivateGlobs({ name: "x" })).toEqual([]);
  });

  it("parses an array of globs verbatim", () => {
    expect(parseActivateGlobs({ activateOn: ["**/*.rs", "src/safety/**"] })).toEqual([
      "**/*.rs",
      "src/safety/**",
    ]);
  });

  it("trims, drops blanks/non-strings, and dedupes (first-seen order)", () => {
    expect(
      parseActivateGlobs({ activateOn: [" **/*.rs ", "**/*.rs", "", 7, null, "*.test.ts"] }),
    ).toEqual(["**/*.rs", "*.test.ts"]);
  });

  it("treats a non-array (string) activateOn as absent => []", () => {
    expect(parseActivateGlobs({ activateOn: "**/*.rs" })).toEqual([]);
  });

  it("treats garbage (object / number / null) activateOn as absent => []", () => {
    expect(parseActivateGlobs({ activateOn: { a: 1 } })).toEqual([]);
    expect(parseActivateGlobs({ activateOn: 42 })).toEqual([]);
    expect(parseActivateGlobs({ activateOn: null })).toEqual([]);
  });

  it("an empty array yields [] (no globs to activate on)", () => {
    expect(parseActivateGlobs({ activateOn: [] })).toEqual([]);
  });
});

describe("matchGlob — ** spans path segments", () => {
  it("**/*.rs matches a nested path", () => {
    expect(matchGlob("**/*.rs", "a/b/c.rs")).toBe(true);
  });

  it("**/*.rs matches a top-level file (zero leading segments)", () => {
    expect(matchGlob("**/*.rs", "x.rs")).toBe(true);
  });

  it("**/*.rs does NOT match a different extension", () => {
    expect(matchGlob("**/*.rs", "x.ts")).toBe(false);
    expect(matchGlob("**/*.rs", "a/b/c.ts")).toBe(false);
  });
});

describe("matchGlob — trailing /** matches a subtree", () => {
  it("src/safety/** matches a file under src/safety", () => {
    expect(matchGlob("src/safety/**", "src/safety/mod.rs")).toBe(true);
  });

  it("src/safety/** matches a deeper file under src/safety", () => {
    expect(matchGlob("src/safety/**", "src/safety/nested/deep.rs")).toBe(true);
  });

  it("src/safety/** does NOT match a sibling outside src/safety", () => {
    expect(matchGlob("src/safety/**", "src/other.rs")).toBe(false);
  });
});

describe("matchGlob — single * stays within one segment", () => {
  it("*.test.ts matches a single-segment file", () => {
    expect(matchGlob("*.test.ts", "foo.test.ts")).toBe(true);
  });

  it("*.test.ts does NOT match a nested file (single * never crosses /)", () => {
    expect(matchGlob("*.test.ts", "a/foo.test.ts")).toBe(false);
  });

  it("* matches a non-empty run within a segment but not across /", () => {
    expect(matchGlob("src/*.ts", "src/foo.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/sub/foo.ts")).toBe(false);
  });
});

describe("matchGlob — ? is a single non-separator char", () => {
  it("matches exactly one char", () => {
    expect(matchGlob("a?c.ts", "abc.ts")).toBe(true);
    expect(matchGlob("a?c.ts", "ac.ts")).toBe(false);
    expect(matchGlob("a?c.ts", "abbc.ts")).toBe(false);
  });

  it("? does not match a path separator", () => {
    expect(matchGlob("a?c", "a/c")).toBe(false);
  });
});

describe("matchGlob — literal + anchoring + safety", () => {
  it("a literal pattern is an exact full-path match", () => {
    expect(matchGlob("src/safety/mod.rs", "src/safety/mod.rs")).toBe(true);
    expect(matchGlob("src/safety/mod.rs", "src/safety/mod.rsx")).toBe(false);
    expect(matchGlob("src/safety/mod.rs", "xsrc/safety/mod.rs")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(matchGlob("**/*.rs", "x.RS")).toBe(false);
    expect(matchGlob("README.md", "readme.md")).toBe(false);
  });

  it("treats regex-special chars in the glob as literals (no injection)", () => {
    // The `.` is a literal dot, not 'any char'; `+` is a literal plus.
    expect(matchGlob("a.b", "axb")).toBe(false);
    expect(matchGlob("a.b", "a.b")).toBe(true);
    expect(matchGlob("c++.ts", "c++.ts")).toBe(true);
    expect(matchGlob("c++.ts", "cxx.ts")).toBe(false);
  });
});

describe("pathActivates", () => {
  it("returns false for an empty glob list (skill without activateOn)", () => {
    expect(pathActivates([], "a/b/c.rs")).toBe(false);
  });

  it("returns true when any glob matches", () => {
    expect(pathActivates(["*.ts", "**/*.rs"], "a/b/c.rs")).toBe(true);
  });

  it("returns false when no glob matches", () => {
    expect(pathActivates(["*.ts", "src/safety/**"], "src/other.go")).toBe(false);
  });
});

describe("skillsForEditedPath", () => {
  const skillGlobs: SkillGlobs[] = [
    { name: "rust-safety", globs: ["**/*.rs", "src/safety/**"] },
    { name: "ts-tests", globs: ["*.test.ts", "**/*.test.ts"] },
    { name: "no-activate", globs: [] },
  ];

  it("returns the matching skill names for a Rust file", () => {
    expect(skillsForEditedPath(skillGlobs, "src/safety/mod.rs")).toEqual(["rust-safety"]);
  });

  it("returns the matching skill names for a nested test file", () => {
    expect(skillsForEditedPath(skillGlobs, "a/foo.test.ts")).toEqual(["ts-tests"]);
  });

  it("a skill with no activateOn is never returned", () => {
    expect(skillsForEditedPath(skillGlobs, "anything.json")).toEqual([]);
  });

  it("no matching skill => []", () => {
    expect(skillsForEditedPath(skillGlobs, "src/other.go")).toEqual([]);
  });

  it("can match multiple skills, in skillGlobs order", () => {
    const multi: SkillGlobs[] = [
      { name: "ts-tests", globs: ["**/*.test.ts"] },
      { name: "all-ts", globs: ["**/*.ts"] },
    ];
    expect(skillsForEditedPath(multi, "a/foo.test.ts")).toEqual(["ts-tests", "all-ts"]);
  });

  it("dedupes a skill name that appears twice / matches via two globs", () => {
    const dup: SkillGlobs[] = [
      { name: "rust", globs: ["**/*.rs"] },
      { name: "rust", globs: ["src/safety/**"] },
    ];
    expect(skillsForEditedPath(dup, "src/safety/mod.rs")).toEqual(["rust"]);
  });
});
