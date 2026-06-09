import { lastAssistantIndex } from "./format.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

// /edit — load the last AI response into the composer for inline editing.
// The host (TUI / REPL) handles loadIntoComposer: it pre-fills the input and,
// when the user submits, replaces convo.messages[editMessageIndex] in place.
// No external editor; no file I/O.

export async function runEdit(ctx: ReplCtx): Promise<SlashResult> {
  const msgs = ctx.convo.messages;
  const idx = lastAssistantIndex(msgs);
  if (idx < 0) return { output: "  (no AI response to edit yet)" };

  const msg = msgs[idx]!;
  if (msg.role !== "assistant") return { output: "  (no AI response to edit yet)" };

  return {
    output: "  ✎ editing — modify in the composer, ⏎ to confirm",
    loadIntoComposer: msg.content,
    editMessageIndex: idx,
  };
}

export const edit: SlashHandler = (_arg, ctx) => runEdit(ctx);
