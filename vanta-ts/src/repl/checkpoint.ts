import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// RUN-RESUME — durable on-disk checkpoint written to .vanta/checkpoint.json.
// Written periodically so a crash / Ctrl+C mid-flight can be resumed.
// Distinct from src/sessions/checkpoint.ts (in-memory rollback stack).

const CHECKPOINT_FILE = "checkpoint.json";

export type CheckpointData = {
  sessionId: string;
  turnIndex: number;
  lastGoal: string;
  lastAction: string;
  savedAt: string;
};

const CheckpointSchema = z.object({
  sessionId: z.string(),
  turnIndex: z.number().int().nonnegative(),
  lastGoal: z.string(),
  lastAction: z.string(),
  savedAt: z.string(),
});

function checkpointPath(dataDir: string): string {
  return join(dataDir, CHECKPOINT_FILE);
}

/** Write checkpoint to .vanta/checkpoint.json (atomic-ish: write then done). */
export async function writeCheckpoint(dataDir: string, data: CheckpointData): Promise<void> {
  await writeFile(checkpointPath(dataDir), JSON.stringify(data, null, 2), "utf8");
}

/** Read .vanta/checkpoint.json. Returns null if missing or corrupt. */
export async function readCheckpoint(dataDir: string): Promise<CheckpointData | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(checkpointPath(dataDir), "utf8"));
    const parsed = CheckpointSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Remove .vanta/checkpoint.json. Idempotent — missing file is not an error. */
export async function clearCheckpoint(dataDir: string): Promise<void> {
  await rm(checkpointPath(dataDir), { force: true });
}
