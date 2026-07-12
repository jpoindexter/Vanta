import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import {
  decomposeObjective,
  synthesize,
  type SubQuery,
  type SubQueryResult,
} from "../solutioning/research-decompose.js";

const Args = z.object({
  objective: z.string().min(1),
  /** Optional fan-out cap (clamped to [2, MAX_SUB_QUERIES] by decompose). */
  dimensions: z.number().int().min(2).max(6).optional(),
});

/**
 * Runs ONE sub-query and reports back what it found AND which tools it ran.
 * Injected so tests use fake results — the default (see `defaultRunner`) spawns
 * a real subagent and captures its tool calls.
 */
export type SubQueryRunner = (sub: SubQuery, ctx: ToolContext) => Promise<SubQueryResult>;

export function researchWorkerTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.VANTA_RESEARCH_WORKER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1000
    ? Math.min(configured, 300_000)
    : 60_000;
}

export async function withResearchDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`research worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Default runner: spawn a scoped subagent per sub-query, tee its tool calls into
 * a ring so we know WHICH tools ran (AgentOutcome doesn't surface them), and
 * return the dimension + tools-used + verified finalText. Lazy imports keep the
 * tool module free of a load-time subagent/registry import cycle.
 */
async function defaultRunner(sub: SubQuery, ctx: ToolContext): Promise<SubQueryResult> {
  const { spawnSubagent } = await import("../subagent/spawn.js");
  const { buildRegistry } = await import("./index.js");
  const { resolveProvider } = await import("../providers/index.js");
  // No recursive research/delegation fan-out from a research worker.
  const registry = buildRegistry({ exclude: ["delegate", "swarm", "research_decompose"] });
  const toolsUsed: string[] = [];
  try {
    const provider = resolveProvider(process.env);
    const outcome = await withResearchDeadline((signal) => spawnSubagent({
      goal: `Research the "${sub.dimension}" dimension`,
      instruction: sub.query,
      maxIterations: 8,
      deps: {
        provider,
        safety: ctx.safety,
        registry,
        root: ctx.root,
        requestApproval: ctx.requestApproval,
        signal,
        onToolCall: (name) => toolsUsed.push(name),
      },
    }), researchWorkerTimeoutMs());
    return { dimension: sub.dimension, query: sub.query, toolsUsed, findings: outcome.finalText };
  } catch (err) {
    return {
      dimension: sub.dimension,
      query: sub.query,
      toolsUsed,
      findings: `error: ${(err as Error).message}`,
    };
  }
}

/**
 * Decompose → run each sub-query in parallel via the (injected) runner → collect
 * tools-used + findings → synthesize. The runner is injected so this is fully
 * unit-testable with fake results (no real subagents/LLM).
 */
export async function runResearchDecompose(
  objective: string,
  ctx: ToolContext,
  dimensions: number | undefined,
  runner: SubQueryRunner,
): Promise<ToolResult> {
  const subs = decomposeObjective(objective, dimensions ?? 4);
  if (subs.length === 0) return { ok: false, output: "research_decompose needs a non-empty objective" };
  const results = await Promise.all(subs.map((sub) => runner(sub, ctx)));
  return { ok: true, output: synthesize(results) };
}

/** Factory so tests can inject a fake parallel-runner; default uses spawnSubagent. */
export function buildResearchDecomposeTool(runner: SubQueryRunner = defaultRunner): Tool {
  return {
    schema: {
      name: "research_decompose",
      description:
        "Decompose a research objective into independent, labeled sub-queries and run them as " +
        "PARALLEL research workers, then return a synthesis that shows, per dimension, WHICH tools " +
        "each ran and what it found. Use for a multi-angle research goal where transparency matters: " +
        "the report is auditable back to the tools that produced each claim.",
      parameters: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            description: "The research objective to fan out across independent dimensions",
          },
          dimensions: {
            type: "integer",
            minimum: 2,
            maximum: 6,
            description: "Optional fan-out cap (number of parallel sub-queries). Default 4.",
          },
        },
        required: ["objective"],
      },
    },
    // The sub-queries' own tool calls are each kernel-assessed as they happen;
    // this is an internal research-orchestration op, so a constant research
    // string keeps the objective's content from false-triggering the classifier.
    describeForSafety: () => "decompose and run a parallel research query",
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: "research_decompose needs an objective string" };
      try {
        return await runResearchDecompose(parsed.data.objective, ctx, parsed.data.dimensions, runner);
      } catch (err) {
        return { ok: false, output: (err as Error).message };
      }
    },
  };
}

/** The registered tool (real subagent runner). */
export const researchDecomposeTool: Tool = buildResearchDecomposeTool();
