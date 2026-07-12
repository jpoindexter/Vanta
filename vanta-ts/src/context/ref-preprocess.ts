import {
  expandContextRefs,
  MAX_CONTEXT_CHARS,
  MAX_REF_CHARS,
  type ExpandDeps,
  type ExpandResult,
} from "./ref-expand.js";

export type ContextRefScope = {
  root: string;
  /** Actual routed model window; controls the aggregate expansion budget. */
  contextWindow: number;
  /** Optional profile/session identity for operator receipts. */
  scopeId?: string;
};

export type PreprocessedRefs = ExpandResult & {
  text: string;
  budgetChars: number;
  scopeId?: string;
};

export function contextRefBudgetChars(contextWindow: number): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return MAX_CONTEXT_CHARS;
  // Reserve most of the window for system/tool schema, conversation, and output.
  return Math.min(MAX_CONTEXT_CHARS, Math.max(4_000, Math.floor(contextWindow * 4 * 0.15)));
}

/** UI-free preprocessing shared by local composer and remote gateway surfaces. */
export async function preprocessContextRefs(
  input: string,
  scope: ContextRefScope,
  deps: ExpandDeps = {},
): Promise<PreprocessedRefs> {
  const budgetChars = contextRefBudgetChars(scope.contextWindow);
  const result = await expandContextRefs(input, scope.root, {
    ...deps,
    maxRefChars: Math.min(deps.maxRefChars ?? MAX_REF_CHARS, budgetChars),
    maxTotalChars: Math.min(deps.maxTotalChars ?? budgetChars, budgetChars),
  });
  return {
    ...result,
    text: result.block ? `${result.block}\n\n${input}` : input,
    budgetChars,
    scopeId: scope.scopeId,
  };
}

export function formatContextRefReceipt(result: PreprocessedRefs): string | null {
  if (result.expanded.length === 0 && result.warnings.length === 0) return null;
  const scope = result.scopeId ? ` · scope ${result.scopeId}` : "";
  const lines = [`Context references${scope} · budget ${result.budgetChars} chars`];
  if (result.expanded.length) lines.push(`Expanded: ${result.expanded.join(", ")}`);
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  return lines.join("\n");
}
