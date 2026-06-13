// Pure formatter for the per-turn token tally committed after each assistant
// turn. Usage comes straight from the agent outcome (real provider counts when
// the provider reports them); null when the provider didn't report usage.

export type TurnUsage = { inputTokens: number; outputTokens: number };

const fmt = (n: number): string => n.toLocaleString();

export function formatTally(usage?: TurnUsage, tokensSaved?: number): string | null {
  if (!usage) return null;
  const total = usage.inputTokens + usage.outputTokens;
  const saved = tokensSaved && tokensSaved > 0 ? ` · ${fmt(tokensSaved)} saved` : "";
  return `  ${fmt(total)} tok · ${fmt(usage.inputTokens)} in · ${fmt(usage.outputTokens)} out${saved}`;
}
