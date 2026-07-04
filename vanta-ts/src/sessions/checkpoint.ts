import type { Message } from "../types.js";

export type Checkpoint = {
  id: string;
  label: string;
  messages: ReadonlyArray<Message>;
  turnIndex: number;
  savedAt: string;
};

/**
 * In-session checkpoint stack. Snapshots the conversation at key moments
 * so the user can /rollback if the agent goes astray.
 *
 * Kept in-memory (not on disk) — checkpoints are per-session safety nets,
 * not durable history. Sessions are persisted separately via sessions/store.ts.
 */
export class CheckpointStore {
  private readonly stack: Checkpoint[] = [];

  save(label: string, messages: Message[], turnIndex: number, now = new Date().toISOString()): string {
    const id = `cp-${this.stack.length + 1}`;
    this.stack.push({ id, label, messages: [...messages], turnIndex, savedAt: now });
    return id;
  }

  rollback(): Checkpoint | null {
    return this.stack.pop() ?? null;
  }

  /**
   * Look up a checkpoint by id (`cp-2`) or label — WITHOUT popping it, so a
   * named checkpoint can be restored (or branched) repeatedly and the stack
   * stays intact. Ids are unique; a repeated label resolves to the MOST RECENT
   * one. Returns null if no checkpoint matches.
   */
  find(nameOrId: string): Checkpoint | null {
    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      const cp = this.stack[i];
      if (cp && (cp.id === nameOrId || cp.label === nameOrId)) return cp;
    }
    return null;
  }

  latest(): Checkpoint | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  count(): number {
    return this.stack.length;
  }

  list(): ReadonlyArray<Omit<Checkpoint, "messages">> {
    return this.stack.map(({ id, label, turnIndex, savedAt }) => ({ id, label, turnIndex, savedAt }));
  }
}
