import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import type { SlashHandler } from "./types.js";

function formatList(): string {
  const snapshots = globalFileCheckpointStore.list();
  if (!snapshots.length) return "  (no file checkpoints yet)";
  return snapshots
    .map((s) => `  ${s.id}  ${s.path}  ${s.content === null ? "created file" : `${s.content.length} chars`}  ${s.savedAt}`)
    .join("\n");
}

export const rewind: SlashHandler = async (arg) => {
  const id = arg.trim();
  if (!id) return { output: formatList() };
  const restored = await globalFileCheckpointStore.restore(id);
  if (!restored) return { output: `  no file checkpoint "${id}"` };
  return { output: `  ↩ restored ${restored.path} from ${restored.id}` };
};
