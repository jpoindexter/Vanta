/** Priority-ordered categories of work triage finds. */
export type WorkCategory = "quality" | "test-failure" | "type-error" | "roadmap" | "parked";

/** One concrete item of work for the factory — derived from real artifacts, not vibes. */
export type WorkItem = {
  category: WorkCategory;
  description: string;
  /** Failing test name, first type error line, ROADMAP checkbox text, etc. */
  hint?: string;
  /** File to fix (relative to root). */
  targetFile?: string;
  /** 1-based line in ROADMAP.md or PARKED.md where this item lives (for checkbox tick). */
  sourceLine?: number;
  /** Roadmap JSON item ID (e.g. "EF-SCOPEDELTA") — present when parsed from ROADMAP.md. */
  roadmapId?: string;
};

/** Agent instruction + metadata produced by the planner for one slice. */
export type FactoryPlan = {
  workItem: WorkItem;
  /** The full agent instruction sent to the executor. */
  instruction: string;
  /** Dirs the executor will work in — each gets a CLAUDE.md/AGENTS.md check. */
  touchedDirs: string[];
};

/** Artefacts produced by the executor — needed by the verifier. */
export type SliceArtifact = {
  /** New test files added this cycle (relative to root). May NOT modify existing ones. */
  newTestFiles: string[];
  /** All files written/modified this cycle (from `git diff --name-only`). */
  touchedFiles: string[];
  /** Approximate output tokens spent. */
  tokenSpend: number;
};

/** Result of the verifier's trust gate. */
export type VerifyResult = {
  ok: boolean;
  reason?: string;
};

/**
 * How far the factory proceeds autonomously after a clean verify (the "autonomy ladder"):
 *   1 suggest    — print the plan, change nothing
 *   2 implement  — branch, execute, verify, then STOP (human reviews the diff)
 *   3 commit     — also commit the verified slice, but do NOT push
 *   4 push       — also push the branch (no merge)
 *   5 merge      — also auto-merge low-risk slices into a dedicated integration
 *                  branch (OFF unless VANTA_AUTONOMY_ALLOW_MERGE is set; see merge.ts)
 * The kernel's `is_protected_path` blocks skeleton/brainstem (kernel, factory, manifesto)
 * edits at EVERY level — the ladder controls reach over WRITABLE code only.
 */
export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

/** Configuration for one factory cycle. */
export type FactoryConfig = {
  argoRoot: string;
  dataDir: string;
  autonomyLevel: AutonomyLevel;
  /** Hard ceiling on output tokens per cycle. Default: 80_000. */
  budgetTokens: number;
  /** True when launched via `argo improve` (streams to TUI). False for gateway child. */
  interactive: boolean;
};

/** Summary of a completed (or aborted) cycle. */
export type CycleResult =
  | { status: "nothing-to-do" }
  | { status: "aborted"; reason: string }
  | { status: "verify-failed"; workItem: WorkItem; reason: string }
  | { status: "implemented"; workItem: WorkItem; branch: string; tokenSpend: number }
  | {
      status: "committed";
      workItem: WorkItem;
      branch: string;
      commitSha: string;
      tokenSpend: number;
      pushed: boolean;
    }
  | {
      status: "merged";
      workItem: WorkItem;
      branch: string;
      commitSha: string;
      tokenSpend: number;
      mergedInto: string;
    };
