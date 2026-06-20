import { describe, it, expect } from "vitest";
import {
  resolveAttribution,
  gitInstructionsBlock,
  formatPrUrl,
  shouldRespectGitignore,
  PR_PLACEHOLDER,
} from "./git-settings.js";
import type { Settings } from "./store.js";

describe("resolveAttribution", () => {
  it("returns undefined when unset (today's behavior — no attribution appended)", () => {
    expect(resolveAttribution({})).toBeUndefined();
  });

  it("returns the configured override line", () => {
    const s: Settings = { attribution: "Co-Authored-By: Vanta <ops@theft.studio>" };
    expect(resolveAttribution(s)).toBe("Co-Authored-By: Vanta <ops@theft.studio>");
  });

  it("treats a blank/whitespace override as unset", () => {
    expect(resolveAttribution({ attribution: "   " })).toBeUndefined();
  });

  it("trims surrounding whitespace from the override", () => {
    expect(resolveAttribution({ attribution: "  Co-Authored-By: X <x@y>  " })).toBe(
      "Co-Authored-By: X <x@y>",
    );
  });
});

describe("gitInstructionsBlock", () => {
  it("returns '' when unset (default prompt unchanged)", () => {
    expect(gitInstructionsBlock({})).toBe("");
  });

  it("returns '' when explicitly false", () => {
    expect(gitInstructionsBlock({ includeGitInstructions: false })).toBe("");
  });

  it("returns the git best-practice block when enabled", () => {
    const block = gitInstructionsBlock({ includeGitInstructions: true });
    expect(block).not.toBe("");
    expect(block).toMatch(/Git best practice:/);
    expect(block).toMatch(/conventional-commit/);
    expect(block).toMatch(/never force-push/i);
  });
});

describe("formatPrUrl", () => {
  it("substitutes {PR} with the number", () => {
    expect(formatPrUrl("https://github.com/o/r/pull/{PR}", 42)).toBe(
      "https://github.com/o/r/pull/42",
    );
  });

  it("substitutes every {PR} occurrence", () => {
    expect(formatPrUrl("PR {PR} → #{PR}", 7)).toBe("PR 7 → #7");
  });

  it("accepts a string PR number", () => {
    expect(formatPrUrl("pull/{PR}", "13")).toBe("pull/13");
  });

  it("returns the template unchanged when it has no {PR}", () => {
    expect(formatPrUrl("https://example.com/pr", 9)).toBe("https://example.com/pr");
  });

  it("exposes the placeholder constant", () => {
    expect(PR_PLACEHOLDER).toBe("{PR}");
  });
});

describe("shouldRespectGitignore", () => {
  it("defaults to true when unset", () => {
    expect(shouldRespectGitignore({})).toBe(true);
  });

  it("returns the explicit setting", () => {
    expect(shouldRespectGitignore({ respectGitignore: false })).toBe(false);
    expect(shouldRespectGitignore({ respectGitignore: true })).toBe(true);
  });
});
