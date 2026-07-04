import type { SlashHandler } from "./types.js";
import type { CheckpointStore } from "../sessions/checkpoint.js";
import type { Message } from "../types.js";
import {
  saveSession as defaultSaveSession,
  newSessionId as defaultNewSessionId,
  type SaveSessionOpts,
} from "../sessions/store.js";

/**
 * Injected session-write seam so the `/restore … branch` path (which forks a
 * NEW persisted session from a checkpoint) is unit-testable without touching
 * the real `~/.vanta/sessions` dir. Defaults to the real fs-backed functions.
 */
export type CheckpointDeps = {
  saveSession?: (id: string, messages: Message[], opts?: SaveSessionOpts) => Promise<void>;
  newSessionId?: (now?: Date) => string;
  now?: () => Date;
};

/** Split `/restore` args into the target name/id and whether to branch. */
function parseRestoreArg(arg: string): { name: string | null; branch: boolean } {
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  const branch = tokens.some((t) => t === "branch" || t === "--branch");
  const name = tokens.find((t) => t !== "branch" && t !== "--branch") ?? null;
  return { name, branch };
}

export function buildCheckpointHandlers(
  store: CheckpointStore,
  deps: CheckpointDeps = {},
): {
  checkpoint: SlashHandler;
  rollback: SlashHandler;
  restore: SlashHandler;
} {
  const saveSession = deps.saveSession ?? defaultSaveSession;
  const newSessionId = deps.newSessionId ?? defaultNewSessionId;
  const now = deps.now ?? (() => new Date());

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

  const restore: SlashHandler = async (arg, ctx) => {
    const { name, branch } = parseRestoreArg(arg);
    if (!name) return { output: "  usage: /restore <name|id> [branch]  (see /checkpoint)" };
    const cp = store.find(name);
    if (!cp) return { output: `  no checkpoint "${name}" — /checkpoint [label] to save one` };
    if (branch) {
      const id = newSessionId(now());
      await saveSession(id, [...cp.messages], { title: `branch of ${cp.label}` });
      return { output: `  ⑃ branched "${cp.label}" → new session ${id} (${cp.messages.length} messages)` };
    }
    ctx.convo.messages.splice(0, Infinity, ...cp.messages);
    ctx.state.turnIndex = cp.turnIndex;
    return { output: `  ↩ restored "${cp.label}" (${cp.turnIndex} turn(s), ${cp.messages.length} messages)` };
  };

  return { checkpoint, rollback, restore };
}
