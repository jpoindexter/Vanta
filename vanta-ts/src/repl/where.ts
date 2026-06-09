import type { Message } from "../types.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/** Returns the last non-empty user message content, or "" if none. */
export function lastIntent(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && m.content.trim()) return m.content.trim();
  }
  return "";
}

/** Returns the last N tool call names in chronological order. */
export function lastToolCalls(messages: Message[], n: number): string[] {
  const names: string[] = [];
  for (let i = messages.length - 1; i >= 0 && names.length < n; i--) {
    const m = messages[i];
    if (m && m.role === "assistant" && m.toolCalls?.length) {
      for (let j = m.toolCalls.length - 1; j >= 0 && names.length < n; j--) {
        names.push(m.toolCalls[j]!.name);
      }
    }
  }
  return names.reverse();
}

/** /where — show last stated intent and recent tool breadcrumb. */
export const where: SlashHandler = (_arg, ctx: ReplCtx): SlashResult => {
  const intent = lastIntent(ctx.convo.messages);
  const tools = lastToolCalls(ctx.convo.messages, 5);
  const intentLine = `  Last intent: ${intent ? intent.slice(0, 120) : "(none)"}`;
  const toolLine = `  Last tools:  ${tools.length ? tools.join(" → ") : "(none)"}`;
  return { output: `${intentLine}\n${toolLine}` };
};
