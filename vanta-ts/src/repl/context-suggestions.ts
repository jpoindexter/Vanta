// CC-CONTEXT-SUGGESTIONS — when the context window fills, turn the abstract
// "you're 80% full" number into specific, actionable removals: which tool
// outputs to drop and how many tokens that frees. Pure + deterministic so the
// /context command can render it and tests can pin the boundaries exactly.

import type { Message } from "../types.js";

export type ContextSuggestion = {
  severity: "info" | "warning";
  text: string;
  savedTokens: number;
};

/** ~4 chars per token — the same estimate the /context + /usage bars use. */
const CHARS_PER_TOKEN = 4;
/** Below this fill ratio there's nothing to suggest. */
const SUGGEST_AT = 0.7;
/** At/above this fill ratio suggestions escalate to "warning". */
const WARN_AT = 0.85;
/** A tool group must free at least this many tokens to be worth surfacing. */
const MIN_GROUP_TOKENS = 1000;

/** "4123" → "4k". Floors to whole thousands; sub-1k renders as "0k". */
export function kTok(n: number): string {
  return `${Math.floor(n / 1000)}k`;
}

const estTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/** Sum tool-output tokens per tool `name` (e.g. shell_cmd, read_file, web_fetch). */
function groupTokensByName(messages: Message[]): Map<string, { count: number; tokens: number }> {
  const groups = new Map<string, { count: number; tokens: number }>();
  for (const m of messages) {
    if (m.role !== "tool") continue;
    const name = m.name || "tool";
    const prev = groups.get(name) ?? { count: 0, tokens: 0 };
    groups.set(name, { count: prev.count + 1, tokens: prev.tokens + estTokens(m.content) });
  }
  return groups;
}

/**
 * Actionable removals once context is ≥70% full. Each heavy tool group becomes
 * a "Remove N <name> outputs (~Xk tokens)" suggestion; a /compress fallback is
 * always included. Returns [] below 70%. Sorted by tokens freed, descending.
 */
export function contextSuggestions(messages: Message[], window: number): ContextSuggestion[] {
  const total = messages.reduce((n, m) => n + estTokens("content" in m ? m.content : ""), 0);
  const fill = window > 0 ? total / window : 0;
  if (fill < SUGGEST_AT) return [];

  const severity: ContextSuggestion["severity"] = fill >= WARN_AT ? "warning" : "info";
  const out: ContextSuggestion[] = [];
  for (const [name, g] of groupTokensByName(messages)) {
    if (g.tokens < MIN_GROUP_TOKENS) continue;
    out.push({
      severity,
      text: `Remove ${g.count} ${name} output${g.count === 1 ? "" : "s"} (~${kTok(g.tokens)} tokens)`,
      savedTokens: g.tokens,
    });
  }
  out.sort((a, b) => b.savedTokens - a.savedTokens);
  out.push({ severity, text: "Run /compress to compact the whole conversation", savedTokens: 0 });
  return out;
}
