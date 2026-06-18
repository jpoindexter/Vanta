import type { AgentDeps } from "../agent.js";
import type { ShellHook } from "./shell-hooks.js";
import type { ShellHookResult } from "./shell-hook-run.js";
import { hookTextResult } from "./hook-result.js";

const HookVerdictSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["allow", "block"] },
    reason: { type: "string" },
  },
  required: ["decision", "reason"],
};

export async function runAgentHook(
  hook: ShellHook,
  contextJson: string,
  deps: AgentDeps,
): Promise<ShellHookResult> {
  const { spawnSubagent } = await import("../subagent/spawn.js");
  const outcome = await spawnSubagent({
    goal: "Evaluate hook event",
    instruction: `${hook.prompt}\n\nHook event JSON:\n${contextJson}\n\nReturn a JSON verdict.`,
    deps: { ...deps, outputSchema: hook.outputSchema ?? HookVerdictSchema },
    maxIterations: hook.maxIterations ?? 8,
  });
  const text = outcome.structuredResult === undefined ? outcome.finalText : JSON.stringify(outcome.structuredResult);
  return hookTextResult(text);
}
