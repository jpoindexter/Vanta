import { describe, it, expect } from "vitest";
import {
  buildSecurityReviewPrompt,
  collectBranchDiff,
  securityReviewResult,
  securityReview,
  THREAT_CLASSES,
  type SecurityReviewDeps,
} from "./security-review-cmd.js";
import type { ReplCtx } from "./types.js";

const SAMPLE_DIFF =
  "diff --git a/src/db.ts b/src/db.ts\n" +
  '+  const q = `SELECT * FROM u WHERE id=${req.params.id}`;\n';

describe("buildSecurityReviewPrompt", () => {
  it("names every threat class and embeds the diff", () => {
    const prompt = buildSecurityReviewPrompt(SAMPLE_DIFF);
    expect(prompt).toContain("SECURITY REVIEW");
    expect(prompt).toContain("injection");
    expect(prompt).toContain("secret / credential leak");
    expect(prompt).toContain("authz / scope bypass");
    expect(prompt).toContain("path traversal");
    expect(prompt).toContain("unsafe exec / eval");
    expect(prompt).toContain("SSRF");
    // every catalogued class is present
    for (const cls of THREAT_CLASSES) expect(prompt).toContain(cls);
    // the diff is carried verbatim for concrete review
    expect(prompt).toContain(SAMPLE_DIFF);
  });

  it("is read-only — instructs not to modify code", () => {
    const prompt = buildSecurityReviewPrompt(SAMPLE_DIFF);
    expect(prompt.toLowerCase()).toContain("do not modify");
  });
});

describe("collectBranchDiff", () => {
  it("diffs merge-base(base,HEAD)..HEAD via the injected runner", async () => {
    const calls: string[][] = [];
    const deps: SecurityReviewDeps = {
      base: "main",
      gitDiff: async (args) => {
        calls.push(args);
        if (args[0] === "merge-base") return "abc123\n";
        if (args[0] === "diff") return SAMPLE_DIFF;
        return "";
      },
    };
    const diff = await collectBranchDiff(deps);
    expect(diff).toBe(SAMPLE_DIFF.trim());
    expect(calls[0]).toEqual(["merge-base", "main", "HEAD"]);
    expect(calls[1]).toEqual(["diff", "abc123..HEAD"]);
  });

  it("falls back to base..HEAD when merge-base is empty", async () => {
    const calls: string[][] = [];
    const deps: SecurityReviewDeps = {
      base: "develop",
      gitDiff: async (args) => {
        calls.push(args);
        if (args[0] === "diff") return "some diff";
        return ""; // merge-base empty
      },
    };
    await collectBranchDiff(deps);
    expect(calls[1]).toEqual(["diff", "develop..HEAD"]);
  });

  it("defaults the base to main when none is given", async () => {
    const calls: string[][] = [];
    const deps: SecurityReviewDeps = {
      gitDiff: async (args) => {
        calls.push(args);
        return "";
      },
    };
    await collectBranchDiff(deps);
    expect(calls[0]).toEqual(["merge-base", "main", "HEAD"]);
  });

  it("returns empty string when there is no diff", async () => {
    const deps: SecurityReviewDeps = { gitDiff: async () => "" };
    expect(await collectBranchDiff(deps)).toBe("");
  });
});

describe("securityReviewResult", () => {
  it("resends the security prompt when there is a diff", () => {
    const r = securityReviewResult(SAMPLE_DIFF);
    expect(r.resend).toBeDefined();
    expect(r.resend).toContain("SECURITY REVIEW");
    expect(r.resend).toContain(SAMPLE_DIFF);
    expect(r.output).toContain("security-review");
  });

  it("returns a clean no-op message with no resend when the diff is empty", () => {
    const r = securityReviewResult("");
    expect(r.resend).toBeUndefined();
    expect(r.output?.toLowerCase()).toContain("no diff to review");
  });
});

describe("securityReview handler", () => {
  it("returns a clean no-op when the repo has no branch changes", async () => {
    // No real git: a non-repo dataDir means every git call fails → "" → no-op.
    const ctx = { dataDir: "/tmp/vanta-nonexistent-xyz/.vanta" } as ReplCtx;
    const r = await securityReview("", ctx);
    expect(r.resend).toBeUndefined();
    expect(r.output?.toLowerCase()).toContain("no diff to review");
  });
});
