import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OutreachStateSchema, newOutreachState, type OutreachState } from "./outreach.js";

// Durable outreach state at `.vanta/outreach.json`. Tolerant: a missing or
// corrupt file resets to a fresh state rather than wedging the heartbeat —
// same contract as proactive/store.ts.

export function outreachPath(dataDir: string): string {
  return join(dataDir, "outreach.json");
}

export async function loadOutreachState(dataDir: string): Promise<OutreachState> {
  try {
    const parsed = OutreachStateSchema.safeParse(JSON.parse(await readFile(outreachPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : newOutreachState();
  } catch {
    return newOutreachState();
  }
}

export async function saveOutreachState(dataDir: string, state: OutreachState): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(outreachPath(dataDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
