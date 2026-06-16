import { z } from "zod";

// The eval reward signal for the self-improving loop (factory). A task = an
// instruction + optional seed files + ONE deterministic check. pass@1 over the
// corpus is the score the evolve objective optimizes (see docs/agentic-harness-
// engineering.md, AHE-EVAL-* cards). Checks are deterministic on purpose — the
// grader must be trustworthy and un-gameable (it runs OUTSIDE the agent).

export const CheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file_exists"), path: z.string().min(1) }),
  z.object({ kind: z.literal("file_contains"), path: z.string().min(1), text: z.string().min(1) }),
  z.object({ kind: z.literal("shell_ok"), cmd: z.string().min(1) }),
]);
export type Check = z.infer<typeof CheckSchema>;

export const EvalTaskSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
  /** Relative-path → file-content, written into the sandbox before the run. */
  seed: z.record(z.string()).optional(),
  check: CheckSchema,
});
export type EvalTask = z.infer<typeof EvalTaskSchema>;

export type EvalResult = {
  id: string;
  /** Solid pass = passed ALL rollouts (passes === runs). */
  pass: boolean;
  /** Rollouts that passed / attempted — k≥2 stabilizes the noisy single-rollout signal. */
  passes: number;
  runs: number;
  detail: string;
  outputTokens?: number;
};

export type EvalReport = {
  total: number;
  /** Tasks that solidly passed (all rollouts). */
  passed: number;
  /** pass@1 = mean over tasks of (passes/runs), as a percentage, one decimal. */
  passAt1: number;
  outputTokens: number;
  results: EvalResult[];
};
