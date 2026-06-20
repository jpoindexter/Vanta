import { z } from "zod";
import type { Tool, ToolContext } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import {
  runCouncil,
  formatCouncil,
  type RoleRunner,
  type RoleAnswer,
} from "../council/council.js";

const Args = z.object({
  question: z.string().min(1),
  max_iterations: z.number().int().min(1).max(50).optional(),
});

/** Render the prior lenses so the synthesis role can reconcile them. */
function priorContext(priors: readonly RoleAnswer[]): string {
  return priors.map((a) => `[${a.role} · ${a.lens}]\n${a.answer}`).join("\n\n");
}

/** Build the worker instruction for one role's contribution. */
function roleInstruction(
  role: { name: string; lens: string; brief: string },
  question: string,
  priors: readonly RoleAnswer[] | undefined,
): string {
  const base =
    `You are the ${role.name} on a decision council, arguing strictly from your lens: ${role.lens}.\n` +
    `${role.brief}\n\nQuestion: ${question}\n`;
  if (!priors) return `${base}\nRespond with your assessment from this lens only — concise, decision-relevant.`;
  return (
    `${base}\nThe other roles answered:\n\n${priorContext(priors)}\n\n` +
    `Reconcile these lenses into ONE consolidated recommendation. Name the key tradeoffs and the decision.`
  );
}

/**
 * Wire {@link runCouncil} to real scoped subagents. The child registry excludes
 * recursive fan-out tools (`delegate`/`swarm`/`council`) so the council stays
 * bounded — no worker can convene its own council. Every worker tool call is
 * kernel-gated as it happens.
 */
function spawnRoleRunner(ctx: ToolContext, maxIterations?: number): RoleRunner {
  return async ({ role, question, priorAnswers }) => {
    const { buildRegistry } = await import("./index.js"); // lazy → no import cycle
    const registry = buildRegistry({ exclude: ["delegate", "swarm", "council"] });
    const provider = resolveProvider(process.env);
    const outcome = await spawnSubagent({
      goal: `Council ${role.name}: ${question}`.slice(0, 120),
      instruction: roleInstruction(role, question, priorAnswers),
      deps: {
        provider,
        safety: ctx.safety,
        registry,
        root: ctx.root,
        requestApproval: ctx.requestApproval,
        maxIterations,
      },
      maxIterations,
    });
    return outcome.finalText;
  };
}

export const councilTool: Tool = {
  schema: {
    name: "council",
    description:
      "Convene a bounded role council (CEO/CTO/COO/CFO + a Reflection role) on one question. " +
      "Each role deliberates from its lens in a single pass, then the Reflection role synthesizes " +
      "them into ONE consolidated recommendation. The roster is fixed and capped — no recursion. " +
      "Use for a multi-perspective decision (ship/no-ship, build-vs-buy, strategy calls).",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The decision/question the council deliberates on",
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Optional per-role worker loop cap (1-50)",
        },
      },
      required: ["question"],
    },
  },
  // Constant string by design: each worker's own tool calls are kernel-assessed
  // as they happen, so echoing the question here would only let its content
  // false-trigger the safety classifier. The kernel still gates the spawn.
  describeForSafety: () => "convene a bounded role council of worker agents",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "council needs a question string" };
    const { question, max_iterations: maxIterations } = parsed.data;
    try {
      const runRole = spawnRoleRunner(ctx, maxIterations);
      const result = await runCouncil(question, { runRole });
      return { ok: true, output: formatCouncil(question, result) };
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  },
};
