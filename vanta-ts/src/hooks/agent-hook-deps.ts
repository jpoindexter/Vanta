import type { AgentDeps } from "../agent.js";
import { runAgentHook } from "./agent-hook-run.js";
import type { HookRunDeps } from "./shell-hook-run.js";

export function buildAgentHookDeps(
  deps: AgentDeps,
  onStatus?: (message: string) => void,
): HookRunDeps {
  return {
    promptProvider: deps.provider,
    onStatus: onStatus ?? deps.onText,
    runAgentHook: (hook, contextJson) => runAgentHook(hook, contextJson, deps),
  };
}
