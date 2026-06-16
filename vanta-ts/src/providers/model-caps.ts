// Model capability flags. Extracted from catalog.ts (size gate).

/**
 * Optional params a model may or may not accept. Providers check this before
 * sending a param so free-typed OpenRouter/Ollama IDs don't 400/500.
 * Default for unknown model + unknown capability: true (allow).
 */
export type ModelCapability = "temperature" | "reasoning_effort" | "thinking";

// Prefix patterns that LACK a capability. Checked in order; first match wins.
// Unknown model → falls through → default allow.
const BLOCKS: Array<{ prefixes: string[]; blocks: ModelCapability[] }> = [
  {
    // OpenAI o-series: no temperature, but supports reasoning_effort
    prefixes: ["o1", "o3", "o4"],
    blocks: ["temperature"],
  },
  {
    // Older Claude (pre-3.7 / pre-4): no extended thinking
    prefixes: ["claude-1", "claude-2", "claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    blocks: ["thinking"],
  },
];

// Prefix patterns that explicitly SUPPORT a capability (overrides default false).
const ALLOWS: Array<{ prefixes: string[]; allows: ModelCapability[] }> = [
  {
    prefixes: ["o1", "o3", "o4"],
    allows: ["reasoning_effort"],
  },
  {
    // Claude 3.7+ and Claude 4 support extended thinking
    prefixes: ["claude-3-7", "claude-sonnet-4", "claude-opus-4", "claude-haiku-4"],
    allows: ["thinking"],
  },
];

/**
 * Returns whether a model supports a given optional capability.
 * Defaults to `true` (allow) for unknown models or unknown capabilities —
 * it's better to attempt and get a provider error than silently drop a feature.
 */
export function modelSupports(modelId: string, capability: ModelCapability): boolean {
  for (const { prefixes, blocks } of BLOCKS) {
    if (prefixes.some((p) => modelId.startsWith(p)) && (blocks as string[]).includes(capability)) {
      return false;
    }
  }
  const hasAllowList = ALLOWS.some((a) => (a.allows as string[]).includes(capability));
  if (hasAllowList) {
    return ALLOWS.some(
      ({ prefixes, allows }) =>
        (allows as string[]).includes(capability) && prefixes.some((p) => modelId.startsWith(p)),
    );
  }
  return true;
}
