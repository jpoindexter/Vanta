import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import type { SlashHandler } from "./types.js";

function formatList(): string {
  const snapshots = globalFileCheckpointStore.list();
  if (!snapshots.length) return "  (no file checkpoints yet)";
  const lines = snapshots
    .map((s) => `  ${s.id}  turn ${s.turn}  ${s.path}  ${s.content === null ? "created file" : `${s.content.length} chars`}  ${s.savedAt}`);
  return `${lines.join("\n")}\n  (\`/rewind turn\` rolls back the last turn's file mutations)`;
}

export const rewind: SlashHandler = async (arg) => {
  const id = arg.trim();
  if (!id) return { output: formatList() };
  // OP-CHECKPOINT-ROLLBACK: `/rewind turn [n]` rolls back a whole turn's file
  // mutations (default: the last turn) to their pre-turn state; bare `/rewind
  // <id>` still restores a single file snapshot.
  if (id === "turn" || id.startsWith("turn ")) {
    const arg2 = id.slice(4).trim();
    const turn = arg2 ? Number(arg2) : undefined;
    if (arg2 && !Number.isInteger(turn)) return { output: `  usage: /rewind turn [<n>]` };
    const restored = await globalFileCheckpointStore.restoreTurn(turn);
    if (!restored.length) return { output: turn ? `  no file checkpoints for turn ${turn}` : "  (no file checkpoints to roll back)" };
    const files = restored.map((s) => s.path).join(", ");
    return { output: `  ↩ rolled back turn ${restored[0]!.turn} — restored ${restored.length} file(s): ${files}` };
  }
  const restored = await globalFileCheckpointStore.restore(id);
  if (!restored) return { output: `  no file checkpoint "${id}"` };
  return { output: `  ↩ restored ${restored.path} from ${restored.id}` };
};
