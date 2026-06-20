import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SlashHandler, SlashResult } from "./types.js";

// `/security-review` — a built-in security audit of the current branch's changes.
// Collects the branch diff (base..HEAD), then re-sends a security-focused review
// prompt over that diff as a fresh turn (the `resend` pattern, like `/skeptic`).
// Read-only: it reviews the diff, it never modifies code. No diff → a clean no-op.

const execFileAsync = promisify(execFile);

const DEFAULT_BASE = "main";

/** The threat classes the security audit must check for in the diff. */
export const THREAT_CLASSES = [
  "injection (SQL / command / template / prototype pollution)",
  "secret / credential leak (hardcoded keys, tokens, passwords, .env exposure)",
  "authz / scope bypass (missing or weakened authorization, privilege escalation)",
  "path traversal (unsanitized paths escaping an intended directory)",
  "unsafe exec / eval (dynamic code execution, deserialization, shelling out on input)",
  "SSRF (server-side request forgery / unvalidated outbound fetch targets)",
] as const;

/**
 * Build the security-audit instruction over a branch diff. Pure: names every
 * threat class to check and embeds the diff so the agent reviews concrete changes.
 */
export function buildSecurityReviewPrompt(diff: string): string {
  const classes = THREAT_CLASSES.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return (
    "Perform a SECURITY REVIEW of the following branch diff. This is a read-only " +
    "audit — do NOT modify any code. For each change, look specifically for these " +
    "threat classes:\n" +
    `${classes}\n\n` +
    "For every issue found, report: the file + the changed line(s), the threat class, " +
    "why it is exploitable, and the concrete fix. If a change is clean, say so. " +
    "Be specific and evidence-based — cite the exact lines from the diff.\n\n" +
    "=== BRANCH DIFF ===\n" +
    diff
  );
}

/** Injected dependencies for diff collection — `gitDiff` keeps real git out of tests. */
export type SecurityReviewDeps = {
  /** Run git with `args` in `cwd`, returning trimmed stdout (or "" on any failure). */
  gitDiff: (args: string[]) => Promise<string>;
  /** Base ref to diff against (default `main`). */
  base?: string;
};

/**
 * Collect the current branch's diff vs the base (base..HEAD).
 * Returns the diff text, or "" when there is nothing to review (clean / no base).
 */
export async function collectBranchDiff(deps: SecurityReviewDeps): Promise<string> {
  const base = deps.base?.trim() || DEFAULT_BASE;
  // merge-base gives the fork point so we review only this branch's changes, not
  // commits the base gained since. An empty merge-base → fall back to base..HEAD.
  const mergeBase = await deps.gitDiff(["merge-base", base, "HEAD"]);
  const from = mergeBase.split("\n")[0]?.trim() || base;
  const diff = await deps.gitDiff(["diff", `${from}..HEAD`]);
  return diff.trim();
}

/** Build the real git runner rooted at the repo root (dataDir = <repoRoot>/.vanta). */
function repoGitDiff(repoRoot: string): SecurityReviewDeps["gitDiff"] {
  return async (args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
      return stdout.trim();
    } catch {
      return ""; // missing base, not a repo, etc. → treat as no diff
    }
  };
}

/**
 * Decide the slash result from a collected diff. Pure: a diff → a `resend` carrying
 * the security-review prompt; an empty diff → a clean no-op message, no resend.
 */
export function securityReviewResult(diff: string): SlashResult {
  if (!diff) {
    return { output: "  ✓ no diff to review — branch matches the base, nothing to audit" };
  }
  return {
    output: "  ⊙ security-review — auditing branch changes…",
    resend: buildSecurityReviewPrompt(diff),
    resendDisplay: "/security-review (branch diff)",
  };
}

/** `/security-review [base]` — audit the current branch's changes for security issues. */
export const securityReview: SlashHandler = async (arg, ctx): Promise<SlashResult> => {
  const repoRoot = dirname(ctx.dataDir);
  const diff = await collectBranchDiff({ gitDiff: repoGitDiff(repoRoot), base: arg.trim() });
  return securityReviewResult(diff);
};
