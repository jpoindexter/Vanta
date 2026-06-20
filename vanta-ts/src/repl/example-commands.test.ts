import { describe, it, expect } from "vitest";
import {
  buildExampleCommands,
  genericExampleCommands,
  gatherGitSignals,
  formatExamples,
  sanitizeSignal,
  parseDiffNames,
  parseLogSubjects,
  MAX_EXAMPLES,
  type GitSignals,
  type GitRunner,
} from "./example-commands.js";

const NO_SIGNALS: GitSignals = { recentFiles: [], recentSubjects: [] };

describe("buildExampleCommands — changed files", () => {
  it("derives a 'Review the changes in <file>' suggestion from a changed file", () => {
    const out = buildExampleCommands({ recentFiles: ["README.md"], recentSubjects: [] });
    expect(out).toContain("Review the changes in README.md");
  });

  it("adds a 'Write tests for <file>' suggestion for a source file", () => {
    const out = buildExampleCommands({ recentFiles: ["src/foo.ts"], recentSubjects: [] }, 8);
    expect(out).toContain("Review the changes in src/foo.ts");
    expect(out).toContain("Write tests for src/foo.ts");
  });

  it("does NOT suggest writing tests for a non-source file (docs/config)", () => {
    const out = buildExampleCommands({ recentFiles: ["docs/prd.md"], recentSubjects: [] }, 8);
    expect(out).toContain("Review the changes in docs/prd.md");
    expect(out.some((c) => c.startsWith("Write tests for"))).toBe(false);
  });

  it("does NOT suggest writing tests for an existing test file", () => {
    const out = buildExampleCommands({ recentFiles: ["src/foo.test.ts"], recentSubjects: [] }, 8);
    expect(out.some((c) => c.startsWith("Write tests for"))).toBe(false);
  });
});

describe("buildExampleCommands — commit subjects", () => {
  it("derives a 'Continue: <subject>' suggestion from a commit subject", () => {
    const out = buildExampleCommands({ recentFiles: [], recentSubjects: ["wire the gateway"] });
    expect(out).toContain("Continue: wire the gateway");
  });
});

describe("buildExampleCommands — evergreen + dedupe + cap", () => {
  it("always includes at least one evergreen safe suggestion alongside git ones", () => {
    const out = buildExampleCommands({ recentFiles: ["src/a.ts"], recentSubjects: ["b"] });
    const hasEvergreen =
      out.includes("Summarize the last 5 commits") ||
      out.includes("Show me the project structure and what it does");
    expect(hasEvergreen).toBe(true);
  });

  it("includes an evergreen suggestion even when git signals could fill the cap", () => {
    const signals: GitSignals = {
      recentFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
      recentSubjects: ["x", "y"],
    };
    const out = buildExampleCommands(signals);
    expect(out.includes("Summarize the last 5 commits")).toBe(true);
  });

  it("caps at MAX_EXAMPLES by default", () => {
    const signals: GitSignals = {
      recentFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
      recentSubjects: ["one", "two", "three"],
    };
    const out = buildExampleCommands(signals);
    expect(out.length).toBeLessThanOrEqual(MAX_EXAMPLES);
    expect(out).toHaveLength(MAX_EXAMPLES);
  });

  it("respects an explicit cap", () => {
    const out = buildExampleCommands(
      { recentFiles: ["src/a.ts", "src/b.ts"], recentSubjects: ["z"] },
      2,
    );
    expect(out).toHaveLength(2);
  });

  it("de-duplicates identical suggestions from repeated signals (case-insensitive)", () => {
    const out = buildExampleCommands(
      { recentFiles: ["src/a.ts", "src/a.ts"], recentSubjects: [] },
      8,
    );
    const reviews = out.filter((c) => c === "Review the changes in src/a.ts");
    expect(reviews).toHaveLength(1);
  });

  it("returns only evergreen suggestions when given no signals", () => {
    const out = buildExampleCommands(NO_SIGNALS);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("Summarize the last 5 commits");
  });
});

describe("genericExampleCommands — the no-signal fallback", () => {
  it("returns a non-empty safe generic list capped at MAX_EXAMPLES", () => {
    const out = genericExampleCommands();
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(MAX_EXAMPLES);
  });

  it("contains only safe read-only style prompts (no destructive verbs)", () => {
    const out = genericExampleCommands();
    for (const cmd of out) {
      expect(/\b(delete|remove|rm|drop|force|reset --hard)\b/i.test(cmd)).toBe(false);
    }
  });
});

describe("sanitizeSignal — control stripping (anti-injection)", () => {
  it("strips an ANSI escape sequence so it can't reach the suggestion line", () => {
    const dirty = "src/\x1b[31mevil\x1b[0m.ts";
    const clean = sanitizeSignal(dirty);
    expect(clean.includes("\x1b")).toBe(false);
    expect(/[\x00-\x1f\x7f-\x9f]/.test(clean)).toBe(false);
    expect(clean).toBe("src/ [31mevil [0m.ts".replace(/\s+/g, " ").trim());
  });

  it("strips newlines/carriage returns/tabs and collapses whitespace", () => {
    expect(sanitizeSignal("a\nb\tc\r d")).toBe("a b c d");
  });

  it("a control-laden file can't inject escapes into the built suggestion", () => {
    const out = buildExampleCommands(
      { recentFiles: ["src/\x1b]0;pwned\x07x.ts"], recentSubjects: [] },
      8,
    );
    for (const cmd of out) {
      expect(/[\x00-\x1f\x7f-\x9f]/.test(cmd)).toBe(false);
    }
  });

  it("a control-laden commit subject can't inject escapes into the built suggestion", () => {
    const out = buildExampleCommands(
      { recentFiles: [], recentSubjects: ["ship\r\n$(rm -rf /)\x1b[2J"] },
      8,
    );
    for (const cmd of out) {
      expect(/[\x00-\x1f\x7f-\x9f]/.test(cmd)).toBe(false);
    }
    expect(out.some((c) => c.startsWith("Continue:"))).toBe(true);
  });
});

describe("parseDiffNames / parseLogSubjects — fixture parsing", () => {
  it("parses `git diff --name-only` output into a de-duplicated file list", () => {
    const out = "src/a.ts\nsrc/b.ts\nsrc/a.ts\n\n";
    expect(parseDiffNames(out)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("returns an empty list for empty diff output", () => {
    expect(parseDiffNames("")).toEqual([]);
  });

  it("parses `git log --oneline` output, stripping the leading short-sha", () => {
    const out = "2f784cb fix(tests): poll instead of wait\na005267 docs: batch feature\n";
    expect(parseLogSubjects(out)).toEqual([
      "fix(tests): poll instead of wait",
      "docs: batch feature",
    ]);
  });

  it("returns an empty list for empty log output", () => {
    expect(parseLogSubjects("")).toEqual([]);
  });
});

describe("gatherGitSignals — injected runner", () => {
  it("parses fixtures from the injected runner into signals", async () => {
    const run: GitRunner = async (args) => {
      if (args.includes("diff")) return "src/a.ts\nsrc/b.ts\n";
      if (args.includes("log")) return "abc1234 first subject\ndef5678 second subject\n";
      return "";
    };
    const signals = await gatherGitSignals({ run, root: "/repo" });
    expect(signals.recentFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(signals.recentSubjects).toEqual(["first subject", "second subject"]);
  });

  it("passes the repo root through `git -C <root>` to the runner", async () => {
    const seen: string[][] = [];
    const run: GitRunner = async (args) => {
      seen.push(args);
      return "";
    };
    await gatherGitSignals({ run, root: "/my/repo" });
    for (const call of seen) {
      expect(call.slice(0, 2)).toEqual(["-C", "/my/repo"]);
    }
  });

  it("degrades to EMPTY signals when the runner fails (no git / not a repo)", async () => {
    const run: GitRunner = async () => {
      throw new Error("git: command not found");
    };
    const signals = await gatherGitSignals({ run, root: "/repo" });
    expect(signals).toEqual({ recentFiles: [], recentSubjects: [] });
  });
});

describe("formatExamples — the compact 'Try:' block", () => {
  it("renders a header plus a bullet per suggestion", () => {
    const out = formatExamples(["Do a thing", "Do another"]);
    expect(out).toBe("Try:\n  • Do a thing\n  • Do another");
  });

  it("returns '' for an empty list", () => {
    expect(formatExamples([])).toBe("");
  });

  it("end-to-end: a failing runner falls back to a non-empty generic block", async () => {
    const run: GitRunner = async () => {
      throw new Error("not a git repo");
    };
    const signals = await gatherGitSignals({ run, root: "/repo" });
    const cmds =
      signals.recentFiles.length || signals.recentSubjects.length
        ? buildExampleCommands(signals)
        : genericExampleCommands();
    const block = formatExamples(cmds);
    expect(block.startsWith("Try:")).toBe(true);
    expect(block).toContain("•");
  });
});
