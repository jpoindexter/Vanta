import type { Message } from "../types.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";
import { contextSuggestions } from "./context-suggestions.js";

// Context usage command: /context — estimate how the context window is spent,
// broken down by message category, so the user knows what to /compact. Token
// counts are estimates (~4 chars/token), matching the status-bar heuristic.

const CHARS_PER_TOKEN = 4;
const estTok = (s: string): number => Math.round(s.length / CHARS_PER_TOKEN);

export type ContextBreakdown = {
  system: number;
  user: number;
  assistant: number;
  tool: number;
  total: number;
  window: number;
  pct: number;
};

/** Estimate context-window usage by message category. Pure. */
export function contextBreakdown(messages: Message[], window: number): ContextBreakdown {
  let system = 0;
  let user = 0;
  let assistant = 0;
  let tool = 0;
  for (const m of messages) {
    if (m.role === "system") system += estTok(m.content);
    else if (m.role === "user") user += estTok(m.content);
    else if (m.role === "assistant") {
      assistant += estTok(m.content);
      for (const tc of m.toolCalls ?? []) assistant += estTok(JSON.stringify(tc.arguments ?? {}));
    } else tool += estTok(m.content); // role: "tool"
  }
  const total = system + user + assistant + tool;
  const pct = window > 0 ? Math.min(100, Math.round((total / window) * 100)) : 0;
  return { system, user, assistant, tool, total, window, pct };
}

const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const bar = (frac: number, w = 16): string => {
  const filled = Math.max(0, Math.min(w, Math.round(frac * w)));
  return "█".repeat(filled) + "░".repeat(w - filled);
};

/** Format a breakdown as a compact multi-line block. Pure. */
export function formatContextBreakdown(b: ContextBreakdown): string {
  const win = b.window > 0 ? k(b.window) : "?";
  const rows: Array<[string, number]> = [
    ["system", b.system],
    ["user", b.user],
    ["assistant", b.assistant],
    ["tool results", b.tool],
  ];
  const lines = [`  context  ~${k(b.total)} / ${win} tokens (${b.pct}%)  [${bar(b.window > 0 ? b.total / b.window : 0)}]`];
  for (const [label, n] of rows) {
    const share = b.total > 0 ? Math.round((n / b.total) * 100) : 0;
    lines.push(`    ${label.padEnd(13)} ~${k(n).padStart(6)}  ${String(share).padStart(3)}%`);
  }
  return lines.join("\n");
}

/** /context — show context-window usage breakdown + (when full) what to trim. */
export const contextCmd: SlashHandler = (_arg, ctx: ReplCtx): SlashResult => {
  const window = ctx.setup.provider.contextWindow();
  const breakdown = formatContextBreakdown(contextBreakdown(ctx.convo.messages, window));
  // Context suggestions: at ≥70% fill, name the heaviest items to remove.
  const tips = contextSuggestions(ctx.convo.messages, window).map((s) => `  ${s.severity === "warning" ? "⚠" : "·"} ${s.text}`);
  return { output: tips.length ? `${breakdown}\n${tips.join("\n")}` : breakdown };
};
