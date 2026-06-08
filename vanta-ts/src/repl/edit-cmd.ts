import type { EditResult } from "../editor/edit-text.js";
import { editText } from "../editor/edit-text.js";
import { lastAssistantIndex } from "./format.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

// /edit — open the last AI response in the configured editor. On save + close,
// the patched text replaces the assistant message in conversation history.
// GUI editors (VANTA_EDITOR=code) work in both REPL and TUI; terminal editors
// (vim/nano) conflict with the Ink TUI — use them in --no-tui mode only.

/** Testable core — accepts an injected editFn to avoid spawning a real editor. */
export async function runEdit(
  ctx: ReplCtx,
  editFn: (text: string, env: NodeJS.ProcessEnv) => Promise<EditResult> = editText,
): Promise<SlashResult> {
  const msgs = ctx.convo.messages;
  const idx = lastAssistantIndex(msgs);
  if (idx < 0) return { output: "  (no AI response to edit yet)" };

  const msg = msgs[idx]!;
  if (msg.role !== "assistant") return { output: "  (no AI response to edit yet)" };

  const result = await editFn(msg.content, ctx.env);
  if (!result.ok) return { output: `  ✗ ${result.message}` };
  if (result.text === msg.content) return { output: "  · no changes" };

  ctx.convo.messages[idx] = { ...msg, content: result.text };
  return { output: `  ✎ response updated (${result.text.length} chars)` };
}

export const edit: SlashHandler = (_arg, ctx) => runEdit(ctx);
