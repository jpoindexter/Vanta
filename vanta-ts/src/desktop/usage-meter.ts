import type { Message } from "../types.js";

const CHARS_PER_TOKEN = 4;

/**
 * Rough tokens a conversation occupies: text, tool-call arguments and tool results at about four
 * characters per token. Attached image bytes are left out (providers meter images separately), so
 * one screenshot cannot make the meter jump by hundreds of thousands.
 */
export function estimateContextTokens(messages: readonly Message[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    if (message.role === "assistant" && message.toolCalls) chars += JSON.stringify(message.toolCalls).length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}
