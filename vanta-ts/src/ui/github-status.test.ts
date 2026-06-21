import { describe, it, expect } from "vitest";
import {
  parseRepoSlug,
  parsePrJson,
  formatGithubStatus,
  gatherGithubStatus,
  type RunGit,
  type RunGh,
} from "./github-status.js";

describe("parseRepoSlug", () => {
  it("parses an https GitHub URL to owner/name", () => {
    expect(parseRepoSlug("https://github.com/octocat/Hello-World")).toBe("octocat/Hello-World");
  });

  it("parses an https URL with a trailing .git", () => {
    expect(parseRepoSlug("https://github.com/octocat/Hello-World.git")).toBe("octocat/Hello-World");
  });

  it("parses an ssh scp-style GitHub URL to owner/name", () => {
    expect(parseRepoSlug("git@github.com:octocat/Hello-World.git")).toBe("octocat/Hello-World");
  });

  it("parses an ssh:// GitHub URL to owner/name", () => {
    expect(parseRepoSlug("ssh://git@github.com/octocat/Hello-World")).toBe("octocat/Hello-World");
  });

  it("trims surrounding whitespace and a trailing slash", () => {
    expect(parseRepoSlug("  https://github.com/octocat/Hello-World/  ")).toBe("octocat/Hello-World");
  });

  it("returns null for a non-GitHub remote (GitLab)", () => {
    expect(parseRepoSlug("https://gitlab.com/octocat/Hello-World.git")).toBeNull();
  });

  it("returns null for an empty / unparseable URL", () => {
    expect(parseRepoSlug("")).toBeNull();
    expect(parseRepoSlug("not a url")).toBeNull();
  });
});

describe("parsePrJson", () => {
  it("parses the PR fields from a gh object payload", () => {
    const json = JSON.stringify({ number: 12, state: "OPEN", reviewDecision: "APPROVED" });
    expect(parsePrJson(json)).toEqual({ number: 12, state: "OPEN", reviewDecision: "APPROVED" });
  });

  it("accepts gh's single-element array shape", () => {
    const json = JSON.stringify([{ number: 7, state: "OPEN", reviewDecision: "CHANGES_REQUESTED" }]);
    expect(parsePrJson(json)).toEqual({ number: 7, state: "OPEN", reviewDecision: "CHANGES_REQUESTED" });
  });

  it("omits reviewDecision when gh returns an empty string", () => {
    const json = JSON.stringify({ number: 3, state: "OPEN", reviewDecision: "" });
    expect(parsePrJson(json)).toEqual({ number: 3, state: "OPEN" });
  });

  it("returns null for gh's empty-array (no PR) output", () => {
    expect(parsePrJson("[]")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parsePrJson("")).toBeNull();
    expect(parsePrJson("   ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parsePrJson("{not json")).toBeNull();
  });

  it("returns null when the number field is missing", () => {
    expect(parsePrJson(JSON.stringify({ state: "OPEN" }))).toBeNull();
  });
});

describe("formatGithubStatus", () => {
  it("renders repo@branch with PR and an approved glyph", () => {
    const chip = formatGithubStatus({
      repo: "octocat/Hello-World",
      branch: "feature",
      pr: { number: 12, state: "OPEN", reviewDecision: "APPROVED" },
    });
    expect(chip).toBe("⎇ octocat/Hello-World@feature · PR #12 ✓approved");
  });

  it("renders a changes-requested glyph", () => {
    const chip = formatGithubStatus({
      repo: "octocat/Hello-World",
      branch: "fix",
      pr: { number: 9, state: "OPEN", reviewDecision: "CHANGES_REQUESTED" },
    });
    expect(chip).toBe("⎇ octocat/Hello-World@fix · PR #9 ✗changes");
  });

  it("renders the PR number with no glyph when the review is unknown", () => {
    const chip = formatGithubStatus({
      repo: "octocat/Hello-World",
      branch: "main",
      pr: { number: 4, state: "OPEN" },
    });
    expect(chip).toBe("⎇ octocat/Hello-World@main · PR #4");
  });

  it("renders repo@branch with no PR part when there is no PR", () => {
    expect(formatGithubStatus({ repo: "octocat/Hello-World", branch: "main" })).toBe(
      "⎇ octocat/Hello-World@main",
    );
  });

  it("renders just the repo when the branch is absent", () => {
    expect(formatGithubStatus({ repo: "octocat/Hello-World" })).toBe("⎇ octocat/Hello-World");
  });

  it("returns an empty string when there is no repo", () => {
    expect(formatGithubStatus({})).toBe("");
    expect(formatGithubStatus({ branch: "main" })).toBe("");
  });

  it("control-strips an escape-injecting repo/branch (no escape leaks into the chip)", () => {
    // \x1b[31m (ANSI) is removed entirely; \x07 (BEL) / newline become a space.
    const chip = formatGithubStatus({
      repo: "octocat/\x1b[31mHello-World",
      branch: "fea\x07ture\nx",
    });
    expect(chip).toBe("⎇ octocat/Hello-World@fea ture x");
    expect(chip).not.toContain("\x1b");
    expect(chip).not.toContain("\x07");
  });
});

describe("gatherGithubStatus", () => {
  const gitFor = (map: Record<string, string>): RunGit => async (args) => {
    const key = args.join(" ");
    if (key in map) return map[key] ?? "";
    throw new Error(`unexpected git ${key}`);
  };

  it("gathers repo, branch, and PR from the injected runners", async () => {
    const runGit = gitFor({
      "remote get-url origin": "git@github.com:octocat/Hello-World.git",
      "rev-parse --abbrev-ref HEAD": "feature",
    });
    const runGh: RunGh = async () =>
      JSON.stringify({ number: 12, state: "OPEN", reviewDecision: "APPROVED" });
    const status = await gatherGithubStatus({ runGit, runGh });
    expect(status).toEqual({
      repo: "octocat/Hello-World",
      branch: "feature",
      pr: { number: 12, state: "OPEN", reviewDecision: "APPROVED" },
    });
  });

  it("omits the PR (and never calls gh) for a non-GitHub remote", async () => {
    const runGit = gitFor({
      "remote get-url origin": "https://gitlab.com/octocat/Hello-World.git",
      "rev-parse --abbrev-ref HEAD": "main",
    });
    let ghCalled = false;
    const runGh: RunGh = async () => {
      ghCalled = true;
      return "[]";
    };
    const status = await gatherGithubStatus({ runGit, runGh });
    expect(status).toEqual({ branch: "main" });
    expect(ghCalled).toBe(false);
  });

  it("returns repo+branch with no PR when gh reports none", async () => {
    const runGit = gitFor({
      "remote get-url origin": "https://github.com/octocat/Hello-World",
      "rev-parse --abbrev-ref HEAD": "main",
    });
    const runGh: RunGh = async () => "[]";
    const status = await gatherGithubStatus({ runGit, runGh });
    expect(status).toEqual({ repo: "octocat/Hello-World", branch: "main" });
  });

  it("returns {} and never throws when git throws (no repo)", async () => {
    const runGit: RunGit = async () => {
      throw new Error("not a git repository");
    };
    const runGh: RunGh = async () => {
      throw new Error("gh unavailable");
    };
    await expect(gatherGithubStatus({ runGit, runGh })).resolves.toEqual({});
  });

  it("still returns repo+branch when gh throws (PR fetch failure → nothing)", async () => {
    const runGit = gitFor({
      "remote get-url origin": "https://github.com/octocat/Hello-World.git",
      "rev-parse --abbrev-ref HEAD": "feature",
    });
    const runGh: RunGh = async () => {
      throw new Error("gh: not authenticated");
    };
    const status = await gatherGithubStatus({ runGit, runGh });
    expect(status).toEqual({ repo: "octocat/Hello-World", branch: "feature" });
  });

  it("control-strips the gathered branch", async () => {
    const runGit = gitFor({
      "remote get-url origin": "https://github.com/octocat/Hello-World.git",
      "rev-parse --abbrev-ref HEAD": "fea\x1b[0mture",
    });
    const runGh: RunGh = async () => "[]";
    const status = await gatherGithubStatus({ runGit, runGh });
    expect(status.branch).toBe("feature");
  });
});
