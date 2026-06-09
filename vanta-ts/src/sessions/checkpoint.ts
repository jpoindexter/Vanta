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
