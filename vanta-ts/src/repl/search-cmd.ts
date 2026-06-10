import type { SlashHandler } from "./types.js";
import type { Message } from "../types.js";

const PREVIEW_LEN = 80;
const LAST_N_DEFAULT = 5;

function msgText(m: Message): string {
  return typeof m.content === "string" ? m.content : "";
}

function oneLine(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * `/search <query>`
 * Search the current session's conversation history for messages containing
 * the query string (case-insensitive). Shows matching turns as:
 *   [turn N] role: …preview…
 * With no query, shows the last 5 turns as a quick recap.
 */
export const search: SlashHandler = (arg, ctx) => {
  const msgs = ctx.convo.messages;
  // Skip the system message (index 0) for display purposes.
  const turns = msgs.filter((m) => m.role === "user" || m.role === "assistant");

  if (!turns.length) return { output: "  (no conversation history yet)" };

  const q = arg.trim();

  if (!q) {
    // No query → last N turns recap.
    const slice = turns.slice(-LAST_N_DEFAULT);
    const startIdx = turns.length - slice.length;
    const lines = slice.map((m, i) => {
      const n = startIdx + i + 1;
      return `  [turn ${n}] ${m.role}: ${oneLine(msgText(m), PREVIEW_LEN)}`;
    });
    return { output: `  last ${slice.length} turn(s):\n${lines.join("\n")}` };
  }

  // Query mode: case-insensitive substring match.
  const lower = q.toLowerCase();
  const matches: string[] = [];
  turns.forEach((m, i) => {
    if (msgText(m).toLowerCase().includes(lower)) {
      matches.push(`  [turn ${i + 1}] ${m.role}: ${oneLine(msgText(m), PREVIEW_LEN)}`);
    }
  });

  if (!matches.length) return { output: `  no matches for "${q}"` };
  return { output: `  ${matches.length} match(es) for "${q}":\n${matches.join("\n")}` };
};
