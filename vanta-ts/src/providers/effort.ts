import type { CompletionConfig } from "./interface.js";
import { modelSupports } from "./catalog.js";

type DebugLog = (message: string) => void;
type ThinkingParam = { type: "enabled"; budget_tokens: number };
type AnthropicEffortParams = { max_tokens?: number; thinking?: ThinkingParam };

const DEFAULT_MAX_TOKENS = 4096;
const THINKING_BUDGETS = { high: 8000, max: 32000 } as const;

export function debugEffort(message: string): void {
  if (process.env.VANTA_DEBUG || process.env.VANTA_DEBUG_EFFORT) console.error(`debug: ${message}`);
}

export function buildOpenAIEffortParams(
  model: string,
  config?: CompletionConfig,
  debug?: DebugLog,
): Record<string, unknown> {
  // Ollama exposes MiniCPM5's internal reasoning through the OpenAI-compatible
  // endpoint. Without this override it can spend the complete local token cap
  // on hidden reasoning, return no text, and send the agent into another turn.
  if (/minicpm5/i.test(model)) return { reasoning_effort: "none" };
  const effort = config?.effortLevel ?? "medium";
  if (effort === "medium") return {};
  if (!modelSupports(model, "reasoning_effort")) {
    debug?.(`model ${model} does not support reasoning_effort; skipping effort ${effort}`);
    return {};
  }
  return { reasoning_effort: effort };
}

export function buildAnthropicEffortParams(
  model: string,
  config?: CompletionConfig,
  env: NodeJS.ProcessEnv = process.env,
  debug?: DebugLog,
): AnthropicEffortParams {
  const effort = config?.effortLevel ?? "medium";
  if (effort === "low") return { max_tokens: DEFAULT_MAX_TOKENS };
  if (effort === "high" || effort === "max") return thinkingParams(model, THINKING_BUDGETS[effort], effort, debug);
  const budget = parseInt(env.VANTA_THINKING_BUDGET ?? "", 10);
  return !isNaN(budget) && budget > 0 ? thinkingParams(model, budget, "medium", debug) : {};
}

function thinkingParams(model: string, budget: number, effort: string, debug?: DebugLog): AnthropicEffortParams {
  if (!modelSupports(model, "thinking")) {
    debug?.(`model ${model} does not support extended thinking; skipping effort ${effort}`);
    return {};
  }
  return {
    max_tokens: Math.max(DEFAULT_MAX_TOKENS, budget + 1024),
    thinking: { type: "enabled", budget_tokens: budget },
  };
}
