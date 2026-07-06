import { rm, writeFile } from "node:fs/promises";

export type FileCheckpoint = {
  id: string;
  path: string;
  absPath: string;
  content: string | null;
  savedAt: string;
  /** OP-CHECKPOINT-ROLLBACK — the turn this pre-mutation snapshot belongs to. */
  turn: number;
};

export type SaveFileCheckpoint = {
  path: string;
  absPath: string;
  content: string | null;
  now?: string;
};

const MAX_CHECKPOINTS = 20;

export class FileCheckpointStore {
  private readonly snapshots: FileCheckpoint[] = [];
  private next = 1;
  private turn = 1;

  /** OP-CHECKPOINT-ROLLBACK — advance to a new turn; the turn loop calls this at
   * each turn start so snapshots group by turn for turn-granular rollback. */
  beginTurn(): number {
    return (this.turn += 1);
  }

  currentTurn(): number {
    return this.turn;
  }

  /**
   * Snapshot a file's pre-mutation content. ONCE PER TURN per path: a later
   * mutation of the same file within the same turn does NOT re-snapshot, so a
   * turn rollback restores the file's PRE-TURN state (not a mid-turn one).
   * Returns the snapshot id (the existing id when already captured this turn).
   */
  save(input: SaveFileCheckpoint): string {
    const already = this.snapshots.find((s) => s.absPath === input.absPath && s.turn === this.turn);
    if (already) return already.id;
    const id = `fc-${this.next++}`;
    this.snapshots.push({
      id,
      path: input.path,
      absPath: input.absPath,
      content: input.content,
      savedAt: input.now ?? new Date().toISOString(),
      turn: this.turn,
    });
    while (this.snapshots.length > MAX_CHECKPOINTS) this.snapshots.shift();
    return id;
  }

  list(): ReadonlyArray<FileCheckpoint> {
    return [...this.snapshots];
  }

  get(id: string): FileCheckpoint | null {
    return this.snapshots.find((s) => s.id === id) ?? null;
  }

  async restore(id: string): Promise<FileCheckpoint | null> {
    const snapshot = this.get(id);
    if (!snapshot) return null;
    await this.applySnapshot(snapshot);
    return snapshot;
  }

  /** Write a snapshot's pre-mutation content back to disk (or delete a created file). */
  private async applySnapshot(snapshot: FileCheckpoint): Promise<void> {
    if (snapshot.content === null) await rm(snapshot.absPath, { force: true });
    else await writeFile(snapshot.absPath, snapshot.content, "utf8");
  }

  /** The most recent turn that has any snapshots, or null when the store is empty. */
  latestTurn(): number | null {
    return this.snapshots.length ? Math.max(...this.snapshots.map((s) => s.turn)) : null;
  }

  /**
   * OP-CHECKPOINT-ROLLBACK — roll back EVERY file mutation from a turn (default:
   * the latest turn with snapshots), restoring each file's pre-turn content.
   * Independent of the user's real git. Returns the restored snapshots (the
   * turn's captured files); empty when the turn has none.
   */
  async restoreTurn(turn?: number): Promise<FileCheckpoint[]> {
    const target = turn ?? this.latestTurn();
    if (target === null) return [];
    const ofTurn = this.snapshots.filter((s) => s.turn === target);
    // Reverse so, defensively, earlier captures win if a path appeared twice.
    for (const snapshot of [...ofTurn].reverse()) await this.applySnapshot(snapshot);
    return ofTurn;
  }

  clear(): void {
    this.snapshots.splice(0);
    this.next = 1;
    this.turn = 1;
  }
}

export const globalFileCheckpointStore = new FileCheckpointStore();
