import type { Message } from "./types.js";

// One prompt has nothing to jump between; the lone tick read as a stray glyph.
const MIN_PROMPTS_FOR_MAP = 2;

export function hasPromptMap(messages: Message[]): boolean {
  return messages.filter((message) => message.role === "user" && (message.content ?? "").trim()).length >= MIN_PROMPTS_FOR_MAP;
}
