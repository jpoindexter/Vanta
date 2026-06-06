import type { SlashHandler } from "./types.js";
import type { CheckpointStore } from "../sessions/checkpoint.js";

export function buildCheckpointHandlers(store: CheckpointStore): {
  checkpoint: SlashHandler;
  rollback: SlashHandler;
} {
  const checkpoint: SlashHandler = (arg, ctx) => {
    const label = arg.trim() || `turn-${ctx.state.turnIndex}`;
    const id = store.save(label, ctx.convo.messages, ctx.state.turnIndex);
    return { output: `  ✓ checkpoint ${id} "${label}" saved (${ctx.convo.messages.length} messages)` };
  };

  const rollback: SlashHandler = (_arg, ctx) => {
    const cp = store.rollback();
    if (!cp) return { output: "  (no checkpoints — /checkpoint [label] to save one)" };
    ctx.convo.messages.splice(0, Infinity, ...cp.messages);
    ctx.state.turnIndex = cp.turnIndex;
    return { output: `  ↩ rolled back to "${cp.label}" (${cp.turnIndex} turn(s), ${cp.messages.length} messages)` };
  };

  return { checkpoint, rollback };
}
