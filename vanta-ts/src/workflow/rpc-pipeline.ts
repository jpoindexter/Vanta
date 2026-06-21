import { z } from "zod";

/**
 * SCRIPT-RPC-PIPELINE — a declarative linear tool-chain.
 *
 * The lighter sibling of the FABRO workflow GRAPH (`schema.ts`/`execute.ts`):
 * a straight pipeline of tool calls, not a branching graph. Each step invokes
 * a tool, optionally binding its result to a name a later step references via a
 * `$ref` / `{{name}}` placeholder. The WHOLE pipeline runs through one injected
 * `callTool` runner and returns ONLY the final step's result — intermediate
 * outputs stay in `bindings` and never go back through the model, so a
 * deterministic multi-step chain costs ~zero LLM context.
 *
 * Boundary: this is ORCHESTRATION, not a permission escape. `callTool` is the
 * SAME kernel-`assess()`-gated runner a direct tool call uses; every step is
 * gated exactly as if the model had called the tool itself. The pipeline only
 * sequences the calls and threads bindings — it cannot bypass the gate.
 */

/** The result shape an injected `callTool` returns — mirrors `tools/types.ts` ToolResult. */
export type ToolResultLike = { ok: boolean; output: string };

export const PipelineStepSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  assignTo: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
});

export const PipelineSchema = z.object({
  steps: z.array(PipelineStepSchema).min(1).max(50),
});

export type PipelineStep = z.infer<typeof PipelineStepSchema>;
export type Pipeline = z.infer<typeof PipelineSchema>;

export type ParseResult =
  | { ok: true; pipeline: Pipeline }
  | { ok: false; error: string };

/** Bindings carry each assigned step output forward — never surfaced to the model. */
export type Bindings = Record<string, string>;

export type RunResult =
  | { ok: true; result: ToolResultLike; bindings: Bindings }
  | { ok: false; error: string; failedStep: number };

export type PipelineRunDeps = {
  callTool: (tool: string, args: Record<string, unknown>) => Promise<ToolResultLike>;
};

/** A referenced-but-unbound name surfaces this marker instead of a silent empty string. */
export const UNBOUND_MARKER = "<unbound:";

/**
 * Parse + validate a raw pipeline spec. errors-as-values: never throws.
 * Non-empty steps and unique `assignTo` names are enforced.
 */
export function parsePipeline(raw: unknown): ParseResult {
  const parsed = PipelineSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map(issueText).join("; ") };
  }
  const dup = duplicateAssignTo(parsed.data.steps);
  if (dup) return { ok: false, error: `duplicate assignTo name: ${dup}` };
  return { ok: true, pipeline: parsed.data };
}

/**
 * Replace `$name` / `{{name}}` placeholders in an args object with prior bindings.
 * A referenced-but-unbound name becomes an `UNBOUND_MARKER` value (an error
 * marker, surfaced — not a silent empty replacement).
 */
export function substituteRefs(args: Record<string, unknown>, bindings: Bindings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = substituteValue(value, bindings);
  }
  return out;
}

/**
 * Run a pipeline through the injected (kernel-gated) `callTool`.
 *
 * Each step: substitute refs from bindings → call the tool → bind the result if
 * `assignTo`. A tool error (`ok:false`) STOPS the chain and returns `failedStep`.
 * On success, returns ONLY the final step's result as `result`; intermediate
 * outputs live in `bindings`, never surfaced — the zero-context-cost property.
 */
export async function runPipeline(pipeline: Pipeline, deps: PipelineRunDeps): Promise<RunResult> {
  const bindings: Bindings = {};
  let last: ToolResultLike | null = null;
  let i = 0;
  for (const step of pipeline.steps) {
    const outcome = await runStep(step, bindings, deps);
    if (!outcome.ok) return { ok: false, error: outcome.error, failedStep: i };
    last = outcome.result;
    if (step.assignTo) bindings[step.assignTo] = outcome.result.output;
    i++;
  }
  // min(1) on steps guarantees `last` is set; the guard keeps the type honest.
  if (!last) return { ok: false, error: "empty pipeline", failedStep: 0 };
  return { ok: true, result: last, bindings };
}

/**
 * A note describing the zero-context-cost property — only the final result is
 * returned to the model; every intermediate output stays in `bindings`.
 */
export function pipelineContextCost(pipeline: Pipeline): string {
  const n = pipeline.steps.length;
  const intermediate = Math.max(0, n - 1);
  return `pipeline of ${n} step(s): only the final step's result returns to the model; ` +
    `${intermediate} intermediate output(s) stay in bindings (zero LLM context cost).`;
}

type StepOutcome =
  | { ok: true; result: ToolResultLike }
  | { ok: false; error: string };

async function runStep(step: PipelineStep, bindings: Bindings, deps: PipelineRunDeps): Promise<StepOutcome> {
  const args = substituteRefs(step.args, bindings);
  const unbound = firstUnbound(args);
  if (unbound) return { ok: false, error: `step references unbound name: ${unbound}` };
  try {
    const result = await deps.callTool(step.tool, args);
    if (!result.ok) return { ok: false, error: result.output || `tool ${step.tool} failed` };
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function substituteValue(value: unknown, bindings: Bindings): unknown {
  if (typeof value !== "string") return value;
  const bare = value.match(/^\$([a-zA-Z0-9_-]+)$/) ?? value.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
  if (bare?.[1]) return resolveRef(bare[1], bindings);
  return value.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_m, name: string) => resolveRef(name, bindings));
}

function resolveRef(name: string, bindings: Bindings): string {
  const bound = bindings[name];
  return bound === undefined ? `${UNBOUND_MARKER}${name}>` : bound;
}

function firstUnbound(args: Record<string, unknown>): string | null {
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.includes(UNBOUND_MARKER)) {
      const m = value.match(/<unbound:([a-zA-Z0-9_-]+)>/);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function duplicateAssignTo(steps: PipelineStep[]): string | null {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.assignTo) continue;
    if (seen.has(step.assignTo)) return step.assignTo;
    seen.add(step.assignTo);
  }
  return null;
}

function issueText(issue: z.ZodIssue): string {
  const path = issue.path.join(".") || "pipeline";
  return `${path}: ${issue.message}`;
}
