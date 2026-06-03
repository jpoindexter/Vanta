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

/** Whether the factory needs human approval before committing. */
export type AutonomyLevel = "review" | "auto";

/** Configuration for one factory cycle. */
export type FactoryConfig = {
  argoRoot: string;
  dataDir: string;
  autonomy: AutonomyLevel;
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
  | { status: "committed"; workItem: WorkItem; branch: string; commitSha: string; tokenSpend: number };
