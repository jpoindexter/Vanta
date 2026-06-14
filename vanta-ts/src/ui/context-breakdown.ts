// Pure context-usage breakdown by role bucket. No deps, no side effects.

export type CtxCategory = { label: string; tokens: number };

const ROLE_TO_BUCKET: Record<string, string> = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
  function: "tool",
};

const BUCKET_LABELS: Array<{ key: string; label: string }> = [
  { key: "system",    label: "System prompt" },
  { key: "user",      label: "User" },
  { key: "assistant", label: "Assistant" },
  { key: "tool",      label: "Tool results" },
];

function sumByBucket(messages: { role: string; content?: string }[]): Record<string, number> {
  const sums: Record<string, number> = { system: 0, user: 0, assistant: 0, tool: 0 };
  for (const msg of messages) {
    const chars = msg.content?.length ?? 0;
    const bucket = ROLE_TO_BUCKET[msg.role];
    if (chars > 0 && bucket !== undefined) sums[bucket] = (sums[bucket] ?? 0) + chars;
  }
  return sums;
}

/**
 * Estimate per-category token usage of a conversation.
 * Buckets: System, Tools (if toolChars given), User, Assistant, Tool results.
 * Token estimate = ceil(chars / 4). Returns only non-zero categories, sorted
 * by tokens descending.
 */
export function contextBreakdown(
  messages: { role: string; content?: string }[],
  toolChars?: number,
): CtxCategory[] {
  const sums = sumByBucket(messages);
  const results: CtxCategory[] = [];

  if (toolChars != null && toolChars > 0) {
    results.push({ label: "Tools", tokens: Math.ceil(toolChars / 4) });
  }

  for (const { key, label } of BUCKET_LABELS) {
    const chars = sums[key] ?? 0;
    if (chars > 0) results.push({ label, tokens: Math.ceil(chars / 4) });
  }

  return results.sort((a, b) => b.tokens - a.tokens);
}
