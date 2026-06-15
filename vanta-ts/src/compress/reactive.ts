import type { Message } from "../types.js";

const CHARS_PER_TOKEN = 4;
const DEFAULT_THRESHOLD = 0.4;

export type OversizedToolResult = {
  index: number;
  name: string;
  tokens: number;
  pct: number;
};

export type ReactiveCompactResult = {
  compacted: boolean;
  output: string;
  tokensSaved: number;
};

function estTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function analyzeToolResults(
  messages: Message[],
  contextWindow: number,
  threshold = DEFAULT_THRESHOLD,
): OversizedToolResult[] {
  if (contextWindow <= 0) return [];
  const out: OversizedToolResult[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "tool") return;
    const tokens = estTokens(message.content);
    const pct = tokens / contextWindow;
    if (pct > threshold) out.push({ index, name: message.name, tokens, pct });
  });
  return out;
}

export function compactOversizedResult(
  output: string,
  opts: { contextWindow: number; threshold?: number },
): ReactiveCompactResult {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const tokens = estTokens(output);
  if (opts.contextWindow <= 0 || tokens / opts.contextWindow <= threshold) {
    return { compacted: false, output, tokensSaved: 0 };
  }
  const targetChars = Math.min(160, Math.max(40, Math.floor(opts.contextWindow * 0.2 * CHARS_PER_TOKEN)));
  const preview = output.slice(0, targetChars).trimEnd();
  const note = `[Reactive compact: tool result shortened from ${tokens} tokens to protect context; full output omitted.]`;
  const compacted = `${note}\n${preview}`;
  return { compacted: true, output: compacted, tokensSaved: Math.max(0, tokens - estTokens(compacted)) };
}
