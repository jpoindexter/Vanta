import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { newAttribution, recordEdit, attributionTrailers, type AttributionSnapshot } from "./attribution.js";

// VANTA-COMMIT-ATTRIBUTION persistence: one snapshot per session at
// .vanta/attribution/<sessionId>.json. Best-effort, tolerant reads — attribution
// never blocks an edit or a commit.

function snapshotPath(dataDir: string, sessionId: string): string {
  return join(dataDir, "attribution", `${sessionId}.json`);
}

/** Load a session's attribution snapshot, or null when none exists. Tolerant. */
export async function readAttribution(dataDir: string, sessionId: string): Promise<AttributionSnapshot | null> {
  return readFile(snapshotPath(dataDir, sessionId), "utf8")
    .then((t) => JSON.parse(t) as AttributionSnapshot)
    .catch(() => null);
}

async function save(dataDir: string, snapshot: AttributionSnapshot): Promise<void> {
  const path = snapshotPath(dataDir, snapshot.sessionId);
  await mkdir(join(dataDir, "attribution"), { recursive: true });
  await writeFile(path, JSON.stringify(snapshot), "utf8");
}

/**
 * Record a file edit an agent made this session (load → recordEdit → save).
 * Generated files are dropped by recordEdit. Best-effort; never throws. */
export async function recordAgentEdit(
  dataDir: string,
  o: { sessionId: string; agent: string; path: string; content: string; remoteUrl?: string },
): Promise<void> {
  try {
    const current = (await readAttribution(dataDir, o.sessionId)) ?? newAttribution(o.sessionId, o.agent, o.remoteUrl);
    await save(dataDir, recordEdit(current, o.path, o.content));
  } catch { /* attribution is best-effort */ }
}

/** The commit trailers for a session's attributed edits ([] when none). Best-effort. */
export async function trailersForSession(dataDir: string, sessionId: string): Promise<string[]> {
  const snap = await readAttribution(dataDir, sessionId);
  return snap ? attributionTrailers(snap) : [];
}
