import { curate } from "../skills/curator.js";
import { resolveMemoryStore } from "../store/memory-store.js";
import type { MemoryStore } from "../store/memory-store.js";

// Skill-curator scheduler, extracted from session.ts (size gate). Re-exported
// from session.js so callers import it from there unchanged.

const CURATOR_INTERVAL_MS = 7 * 86_400_000; // 7 days

/** Last curator run time from state, or 0 if absent/unparseable. */
async function readLastRunMs(store: MemoryStore, path: string): Promise<number> {
  try {
    const raw = await store.read(path);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && "lastRunMs" in parsed) {
      return Number((parsed as { lastRunMs: unknown }).lastRunMs) || 0;
    }
  } catch {
    // no state yet — first run
  }
  return 0;
}

/**
 * Run the skill curator at most once per interval, at session start. Best-effort
 * and non-destructive (see curator.ts): a failure here never affects the session.
 * State (last-run time) lives in ~/.vanta/.curator_state.json.
 */
export async function maybeCurate(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    const store = resolveMemoryStore(env);
    const statePath = ".curator_state.json";
    const now = Date.now();
    if (now - (await readLastRunMs(store, statePath)) < CURATOR_INTERVAL_MS) return;

    const r = await curate({ env });
    await store.write(statePath, JSON.stringify({ lastRunMs: now }));
    const flagged = r.staleUnowned.length + r.prunable.length + r.overlaps.length;
    if (r.archived.length || flagged) {
      console.log(
        `  · curator: archived ${r.archived.length}, ${flagged} flagged for review`,
      );
    }
  } catch {
    // best-effort maintenance — never break a session on it
  }
}
