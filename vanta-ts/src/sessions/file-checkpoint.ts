import { rm, writeFile } from "node:fs/promises";

export type FileCheckpoint = {
  id: string;
  path: string;
  absPath: string;
  content: string | null;
  savedAt: string;
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

  save(input: SaveFileCheckpoint): string {
    const id = `fc-${this.next++}`;
    this.snapshots.push({
      id,
      path: input.path,
      absPath: input.absPath,
      content: input.content,
      savedAt: input.now ?? new Date().toISOString(),
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
    if (snapshot.content === null) await rm(snapshot.absPath, { force: true });
    else await writeFile(snapshot.absPath, snapshot.content, "utf8");
    return snapshot;
  }

  clear(): void {
    this.snapshots.splice(0);
    this.next = 1;
  }
}

export const globalFileCheckpointStore = new FileCheckpointStore();
