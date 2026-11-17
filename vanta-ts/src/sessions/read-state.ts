import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

const FILE = "session-read-state.json";
const NEVER_READ = "1970-01-01T00:00:00.000Z";

const StateSchema = z.object({ version: z.literal(1), readThrough: z.record(z.string(), z.string()) });
type ReadState = z.infer<typeof StateSchema>;

/**
 * Per-session read watermark: a session is unread when it was updated after the time it was last
 * read. Kept beside the sessions directory (not inside it) so the session store never mistakes it
 * for a transcript, and so the session file format is unchanged. A session with no entry is read.
 */
function statePath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), FILE);
}

export async function loadReadState(env?: NodeJS.ProcessEnv): Promise<ReadState> {
  try {
    const parsed = StateSchema.safeParse(JSON.parse(await readFile(statePath(env), "utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* absent or torn state reads as "everything read" */ }
  return { version: 1, readThrough: {} };
}

async function saveReadState(state: ReadState, env?: NodeJS.ProcessEnv): Promise<void> {
  const path = statePath(env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export function isUnread(state: ReadState, session: { id: string; updated: string }): boolean {
  const watermark = state.readThrough[session.id];
  return watermark !== undefined && watermark < session.updated;
}

export async function setSessionUnread(id: string, unread: boolean, env?: NodeJS.ProcessEnv, now = () => new Date()): Promise<void> {
  const state = await loadReadState(env);
  state.readThrough[id] = unread ? NEVER_READ : now().toISOString();
  await saveReadState(state, env);
}

/** Moves the watermark past every currently unread session; returns how many changed. */
export async function markAllSessionsRead(sessions: { id: string; updated: string }[], env?: NodeJS.ProcessEnv, now = () => new Date()): Promise<number> {
  const state = await loadReadState(env);
  const stamp = now().toISOString();
  const unread = sessions.filter((session) => isUnread(state, session));
  for (const session of unread) state.readThrough[session.id] = stamp;
  if (unread.length) await saveReadState(state, env);
  return unread.length;
}
