import { formatHistory } from "./format.js";
import { copyAnsiToClipboard } from "../term/ansi-png.js";
import type { SlashHandler } from "./types.js";
import type { Message } from "../types.js";

export function screenshotText(messages: readonly Message[]): string {
  const history = formatHistory(messages as Message[]);
  return history || "  (no history yet)";
}

export const screenshot: SlashHandler = async (_arg, ctx) => {
  const text = screenshotText(ctx.convo.messages);
  const result = await copyAnsiToClipboard(text, ctx.env);
  return { output: result.ok ? `  ▧ ${result.message}` : `  ${result.message}` };
};
