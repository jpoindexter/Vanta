// VANTA-PLAN-MODE-V2 — multi-agent plan execution.
//
// Plan mode v2 spawns N concurrent sub-agents that each work a different slice of
// the plan in parallel, then aggregates their results. All side effects (the
// actual sub-agent spawn) are INJECTED, so the orchestration is fully pure-ish
// and testable without an LLM.
//
// This is DISTINCT from /planmode (plan-mode.ts), which is single-agent
// read-only-gated planning. Plan v2 is the fan-out executor.

/** One sub-agent's outcome for a single plan step. */
export type StepResult = {
  /** 1-based step index. */
  step: number;
  /** The per-agent instruction this result came from. */
  prompt: string;
  /** Whether the sub-agent finished cleanly. */
  ok: boolean;
  /** The sub-agent's summary line. */
  summary: string;
};

/** The aggregated outcome of a plan-v2 run. */
export type PlanV2Result = {
  steps: StepResult[];
  /** A one-line roll-up across all steps. */
  summary: string;
};

/** What an injected spawn must return for one step. */
export type SpawnOutcome = { ok: boolean; summary: string };

const DEFAULT_AGENT_COUNT = 1;
const DEFAULT_EXPLORE_COUNT = 3;
const MIN_COUNT = 1;
const MAX_COUNT = 10;

/** Clamp any value (NaN-safe) into the inclusive [MIN_COUNT, MAX_COUNT] band. */
function clampCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.trunc(value)));
}

/**
 * Resolve a count from env: the first set, parseable override wins (clamped
 * 1–10); otherwise the fallback default. Shared by the agent + explore counts.
 */
function resolveCount(env: NodeJS.ProcessEnv, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === "") continue;
    return clampCount(Number(raw));
  }
  return fallback;
}

/**
 * Concurrent sub-agent count for a plan-v2 run.
 *
 * Default 1; `VANTA_PLAN_V2_AGENT_COUNT` (or the legacy
 * `CLAUDE_CODE_PLAN_V2_AGENT_COUNT`) overrides, clamped to 1–10. Pure.
 */
export function planModeV2AgentCount(env: NodeJS.ProcessEnv): number {
  return resolveCount(env, ["VANTA_PLAN_V2_AGENT_COUNT", "CLAUDE_CODE_PLAN_V2_AGENT_COUNT"], DEFAULT_AGENT_COUNT);
}

/**
 * Concurrent explore sub-agent count for a plan-v2 run.
 *
 * Default 3; `VANTA_PLAN_V2_EXPLORE_COUNT` (or the legacy
 * `CLAUDE_CODE_PLAN_V2_EXPLORE_COUNT`) overrides, clamped to 1–10. Pure.
 */
export function planModeV2ExploreAgentCount(env: NodeJS.ProcessEnv): number {
  return resolveCount(env, ["VANTA_PLAN_V2_EXPLORE_COUNT", "CLAUDE_CODE_PLAN_V2_EXPLORE_COUNT"], DEFAULT_EXPLORE_COUNT);
}

/**
 * Deterministically split a task into up to `count` per-agent sub-step
 * descriptions. Each agent gets a numbered slice of the same task so the work is
 * partitioned without an LLM. Pure.
 */
export function splitPlanSteps(task: string, count: number): string[] {
  const trimmed = task.trim();
  const n = clampCount(count);
  if (!trimmed) return [];
  return Array.from({ length: n }, (_, i) =>
    `Step ${i + 1} of ${n}: work this slice of the task — ${trimmed}`,
  );
}

type RunPlanV2Opts = {
  task: string;
  count: number;
  /** Injected sub-agent spawner — one call per plan step, run concurrently. */
  spawn: (stepPrompt: string) => Promise<SpawnOutcome>;
};

/**
 * Run plan v2: split the task into `count` steps, spawn one concurrent
 * sub-agent per step via the injected `spawn`, and aggregate the results.
 *
 * Uses Promise.all for real concurrency. A spawn that rejects is captured as a
 * failed StepResult rather than aborting the whole run. Pure-ish (spawn
 * injected → no LLM in tests).
 */
export async function runPlanV2(opts: RunPlanV2Opts): Promise<PlanV2Result> {
  const prompts = splitPlanSteps(opts.task, opts.count);
  const settled = await Promise.all(prompts.map((prompt) => runStep(prompt, opts.spawn)));
  const steps = settled.map((res, i) => ({ step: i + 1, prompt: prompts[i] ?? "", ...res }));
  return { steps, summary: rollUp(steps) };
}

/** Run one step's spawn, converting a thrown spawn into a failed outcome. */
async function runStep(prompt: string, spawn: RunPlanV2Opts["spawn"]): Promise<SpawnOutcome> {
  try {
    return await spawn(prompt);
  } catch (err) {
    return { ok: false, summary: `spawn failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** One-line roll-up: how many of N steps succeeded. */
function rollUp(steps: StepResult[]): string {
  const done = steps.filter((s) => s.ok).length;
  return `plan v2: ${done}/${steps.length} step(s) succeeded`;
}

const STATUS_DONE = "✓";
const STATUS_FAIL = "✘";

/**
 * Render a progress block showing every agent and its status — one row per
 * step. Pure.
 */
export function formatPlanV2Progress(steps: StepResult[]): string {
  if (!steps.length) return "  (no plan steps)";
  const rows = steps.map((s) => {
    const glyph = s.ok ? STATUS_DONE : STATUS_FAIL;
    return `  ${glyph} agent ${s.step}/${steps.length}: ${oneLine(s.summary)}`;
  });
  return [`  ${steps.length} agent(s) working in parallel:`, ...rows].join("\n");
}

/** Collapse whitespace + cap a summary to one readable line. */
function oneLine(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
