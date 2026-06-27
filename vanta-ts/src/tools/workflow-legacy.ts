import { z } from "zod";
import type { ToolResult } from "./types.js";

// WORKFLOWS (legacy format): the typed step-sequence path — fan-out/synthesize/
// adversarial-verify/tournament/loop steps with a token budget. The modern graph
// format lives in ../workflow/; this is the validation + plan-building for the
// legacy {name,description,steps} spec, kept cohesive in one place.

const StepSchema = z.object({
  id: z.string(),
  type: z.enum(["fan-out", "synthesize", "adversarial-verify", "tournament", "loop"]),
  instruction: z.string(),
  agents: z.number().int().min(1).max(16).optional(),
  budget: z.number().optional(),
  stopCondition: z.string().optional(),
});

const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(StepSchema).min(1).max(10),
  tokenBudget: z.number().optional(),
});

export type WorkflowStep = z.infer<typeof StepSchema>;
export type WorkflowSpec = z.infer<typeof WorkflowSchema>;

export type WorkflowResult = {
  name: string;
  steps: Array<{ id: string; type: string; output: string; agents: number }>;
  finalSynthesis: string;
  totalTokens: number;
};

/** Pure: validate a workflow spec. Returns null if valid, error string if not. */
export function validateWorkflow(spec: unknown): string | null {
  const result = WorkflowSchema.safeParse(spec);
  if (result.success) return null;
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/** Describe a single step for logging. */
export function describeStep(step: WorkflowStep): string {
  return `[${step.type}] ${step.instruction.slice(0, 60)}${step.agents ? ` ×${step.agents}` : ""}`;
}

export async function runLegacyWorkflow(spec: WorkflowSpec): Promise<ToolResult> {
  const results: WorkflowResult["steps"] = [];
  let totalTokens = 0;
  const budget = spec.tokenBudget ?? 50_000;

  for (const step of spec.steps) {
    if (totalTokens >= budget) {
      results.push({ id: step.id, type: step.type, output: "[skipped — budget exhausted]", agents: 0 });
      continue;
    }
    const agentCount = step.agents ?? (step.type === "fan-out" ? 3 : 1);
    // Build the harness plan — actual subagent execution uses the `delegate` tool.
    // The workflow tool produces a structured execution plan the agent follows step-by-step.
    const agentInstructions = Array.from({ length: agentCount }, (_, i) => {
      if (step.type === "adversarial-verify")
        return `Agent ${i + 1}: Adversarially verify — "${step.instruction}". Default to refuted=true if uncertain.`;
      if (step.type === "tournament")
        return `Agent ${i + 1} (angle ${i + 1}/${agentCount}): "${step.instruction}". Choose a distinct approach.`;
      return `Agent ${i + 1}: "${step.instruction}"`;
    });
    const output = [
      `Step ${step.id} [${step.type}] — ${agentCount} agent(s):`,
      ...agentInstructions.map((ins) => `  • ${ins}`),
      step.stopCondition ? `  stop when: ${step.stopCondition}` : null,
    ].filter(Boolean).join("\n");
    totalTokens += agentCount * 1000; // plan estimate
    results.push({ id: step.id, type: step.type, output, agents: agentCount });
  }

  const finalSynthesis = results.map((r) => `## Step ${r.id} (${r.type})\n${r.output}`).join("\n\n");
  return {
    ok: true,
    output: JSON.stringify({ name: spec.name, steps: results.length, totalTokens, synthesis: finalSynthesis.slice(0, 2000) }),
  };
}
