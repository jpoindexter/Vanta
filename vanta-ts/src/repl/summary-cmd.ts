import type { SlashHandler } from "./types.js";
import { lastUserIndex } from "./format.js";

export const summary: SlashHandler = (_arg, ctx) => {
  const userIdx = lastUserIndex(ctx.convo.messages);
  const turnCount = Math.floor((userIdx + 1) / 2) || 1;
  const hasWork = ctx.convo.messages.some(
    (m) => m.role === "assistant" && m.content && String(m.content).length > 20,
  );

  return {
    resend:
      "Summarize this session: what was accomplished, what remains, and what should be done next. " +
      `(${turnCount} turn${turnCount > 1 ? "s" : ""})`,
  };
};
