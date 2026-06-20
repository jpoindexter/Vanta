import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProactiveStateSchema, newProactiveState, recordActivity, type ProactiveState } from "./policy.js";

// Durable proactive state at `.vanta/proactive.json`. Tolerant: a missing or
// corrupt file resets to a fresh state rather than wedging the heartbeat.

export function proactivePath(dataDir: string): string {
  return join(dataDir, "proactive.json");
}

export async function loadProactiveState(dataDir: string): Promise<ProactiveState> {
  try {
    const parsed = ProactiveStateSchema.safeParse(JSON.parse(await readFile(proactivePath(dataDir), "utf8")));
    return parsed.success ? parsed.data : newProactiveState();
  } catch {
    return newProactiveState();
  }
}

export async function saveProactiveState(dataDir: string, state: ProactiveState): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(proactivePath(dataDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Best-effort: stamp user activity so proactive work knows the user is present. */
export async function markProactiveActivity(dataDir: string, now: Date = new Date()): Promise<void> {
  try {
    await saveProactiveState(dataDir, recordActivity(await loadProactiveState(dataDir), now));
  } catch {
    /* activity tracking is best-effort — never break a turn over it */
  }
}
