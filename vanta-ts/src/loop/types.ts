import { z } from "zod";

// First-class loops. The operator designs a loop; Vanta runs it on the gateway
// tick. A loop is a durable object: a goal, a trigger that decides when it wakes,
// an ordered list of stages (each an agent turn), an eval rubric, and stop rules.
// The def is immutable once created; mutable progress lives in LoopState (a
// separate file) so a def can be inspected/edited without racing the runner.

/** What wakes a loop. cron/heartbeat are evaluated on the gateway tick; manual
 *  only via `vanta loop run <id>`; event is declared here but fired later by the
 *  WAKE-CONTEXT card (approval resolutions, etc.) — until then it behaves manual. */
export const TriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({ kind: z.literal("heartbeat"), everyTicks: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal("cron"), expr: z.string().min(1) }),
  z.object({ kind: z.literal("event"), event: z.string().min(1) }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

/** How a stage verifies its own output before advancing. adversarial fans out N
 *  isolated skeptics (majority-refute = fail); tournament runs N candidates and
 *  picks the highest-scoring one; filter runs N candidates and keeps the first that
 *  passes the filterPrompt predicate. */
export const VerifyModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adversarial"), n: z.number().int().positive().default(3) }),
  z.object({ kind: z.literal("tournament"), n: z.number().int().positive().default(3) }),
  z.object({
    kind: z.literal("filter"),
    n: z.number().int().positive().default(3),
    filterPrompt: z.string().min(1),
  }),
]);
export type VerifyMode = z.infer<typeof VerifyModeSchema>;

/** One step of the loop body — an agent turn driven by `prompt`. The conventional
 *  five are discover/plan/execute/evaluate/improve, but any name is allowed. The
 *  stage named `evaluate` is special: its output is scanned for `SCORE: <0..1>`,
 *  which becomes the iteration score. An optional `gate` shell command must exit 0
 *  for the loop to advance past this stage (LOOP-GATES-BUDGETS deepens gating). */
export const StageSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  gate: z.string().optional(),
  /** When set, the engine applies verification after running (or instead of running
   *  once, for tournament/filter). A verify-failed stage acts like a gate failure. */
  verify: VerifyModeSchema.optional(),
});
export type Stage = z.infer<typeof StageSchema>;

/** A weighted scoring criterion. The rubric is advisory context for the evaluate
 *  stage now; RUBRIC-ENGINE turns it into confidence-weighted structured scoring. */
export const RubricItemSchema = z.object({
  criterion: z.string().min(1),
  weight: z.number().min(0).default(1),
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const RubricSchema = z.object({
  items: z.array(RubricItemSchema).default([]),
  passScore: z.number().min(0).max(1).default(0.8),
});
export type Rubric = z.infer<typeof RubricSchema>;

/** When the loop terminates. Any one rule firing stops it. */
export const StopRulesSchema = z.object({
  maxIterations: z.number().int().positive().default(10),
  /** Stop when an iteration's score ≥ this. Defaults to the rubric's passScore. */
  passScore: z.number().min(0).max(1).optional(),
  /** Stop after this many consecutive iterations with no score improvement. */
  noProgressWakes: z.number().int().positive().default(3),
  /** Kill if a single iteration takes longer than this many ms. */
  maxWallMs: z.number().int().positive().optional(),
  /** Kill if a single iteration consumes more than this many tokens (requires getTokensUsed dep). */
  maxTokens: z.number().int().positive().optional(),
  /** Kill if score drops below this floor after a baseline is established. */
  healthScoreFloor: z.number().min(0).max(1).optional(),
  /** Kill if acceptance rate drops below this after minAcceptRateAfter iterations. */
  minAcceptRate: z.number().min(0).max(1).optional(),
  /** Minimum iterations before minAcceptRate is checked. Default 5. */
  minAcceptRateAfter: z.number().int().positive().default(5),
});
export type StopRules = z.infer<typeof StopRulesSchema>;

export const LoopStatus = z.enum(["active", "paused", "done", "killed"]);
export type LoopStatus = z.infer<typeof LoopStatus>;

/** The durable loop definition. Persisted at `.vanta/loops/<id>.json`. */
export const LoopDefSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  trigger: TriggerSchema,
  stages: z.array(StageSchema).min(1),
  rubric: RubricSchema.default({ items: [], passScore: 0.8 }),
  stop: StopRulesSchema.default({ maxIterations: 10, noProgressWakes: 3 }),
  status: LoopStatus.default("active"),
  createdAt: z.string().min(1),
});
export type LoopDef = z.infer<typeof LoopDefSchema>;

/** One recorded iteration outcome — the loop's append-only history. */
export const LoopRunSchema = z.object({
  at: z.string(),
  score: z.number().nullable().default(null),
  note: z.string().default(""),
});
export type LoopRun = z.infer<typeof LoopRunSchema>;

/** A blocker the loop raised that ONLY a human can clear (`vanta loop clear`).
 *  Raising one pauses the loop so it never spins on something it can't resolve —
 *  the durable form of "stop and surface the blocker". The agent-facing tool can
 *  read escalations but cannot clear them. */
export const EscalationSchema = z.object({
  id: z.string(),
  raisedAt: z.string(),
  reason: z.string().min(1),
  status: z.enum(["open", "cleared"]).default("open"),
  clearedAt: z.string().nullable().default(null),
});
export type Escalation = z.infer<typeof EscalationSchema>;

/** Mutable per-loop progress. Persisted at `.vanta/loops/<id>.state.json`, read at
 *  wake and written at exit, so a loop survives restarts mid-flight. */
export const LoopStateSchema = z.object({
  id: z.string().min(1),
  iterations: z.number().int().min(0).default(0),
  lastScore: z.number().nullable().default(null),
  bestScore: z.number().nullable().default(null),
  lastRunAt: z.string().nullable().default(null),
  /** Gateway ticks seen since the last run — drives `heartbeat.everyTicks`. */
  ticksSinceRun: z.number().int().min(0).default(0),
  /** Consecutive iterations with no score improvement — drives the no-progress kill. */
  noProgressStreak: z.number().int().min(0).default(0),
  /** Append-only learnings carried across iterations and restarts. */
  lessons: z.array(z.string()).default([]),
  history: z.array(LoopRunSchema).default([]),
  /** Human-clear-only blockers. Any open entry pauses the loop. */
  escalations: z.array(EscalationSchema).default([]),
  /** Set true at iteration start, false at clean exit. True on reload ⇒ the
   *  previous iteration crashed mid-run — surfaced as a recoverable lesson. */
  inProgress: z.boolean().default(false),
  /** Cumulative tokens used across all iterations (informational). */
  tokensUsed: z.number().int().min(0).default(0),
  /** Iterations where gate passed and score improved — numerator for accept rate. */
  acceptedChanges: z.number().int().min(0).default(0),
  /** Total iterations counted in the acceptance-rate ledger. */
  totalChanges: z.number().int().min(0).default(0),
});
export type LoopState = z.infer<typeof LoopStateSchema>;

/** A fresh zeroed state for a newly registered loop. */
export function newState(id: string): LoopState {
  return LoopStateSchema.parse({ id });
}

/** The score threshold that ends a loop — stop.passScore if set, else the rubric's. */
export function effectivePassScore(def: LoopDef): number {
  return def.stop.passScore ?? def.rubric.passScore;
}

/**
 * Signature the runner (loop/runner.ts) implements and the CLI/gateway call. A
 * `runStage` executes one stage as an agent turn and returns its raw text; the
 * runner threads prior outputs forward, extracts the evaluate score, updates
 * state, and applies stop rules. Injected deps keep it testable without an LLM.
 */
export type RunStage = (input: { stage: Stage; goal: string; prior: string }) => Promise<string>;
export type RunGate = (cmd: string) => Promise<boolean>;
export type IterationDeps = {
  runStage: RunStage;
  now: () => Date;
  runGate?: RunGate;
  /** Called after all stages to get the token count for this iteration. */
  getTokensUsed?: () => number;
  /** Called when the loop is killed by any budget, health, or rate rule. */
  logKilled?: (id: string, reason: string) => void;
};
export type IterationResult = {
  def: LoopDef;
  state: LoopState;
  score: number | null;
  stopped: boolean;
  reason: string;
};
