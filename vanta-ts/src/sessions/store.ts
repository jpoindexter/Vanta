import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";
import type { Message } from "../types.js";
import type { SessionStore } from "./interface.js";

// File-based session persistence: one JSON file per session under
// ~/.vanta/sessions/<id>.json. Plain files (not SQLite) — dependency-free,
// git-versionable, and consistent with how skills/memory are stored. Enough for
// a single-user CLI; the value of SQLite (concurrency/queries) isn't needed.

const SESSIONS_SUBDIR = "sessions";

const MessageSchema: z.ZodType<Message> = z.lazy(() =>
  z.union([
    z.object({ role: z.literal("system"), content: z.string() }),
    z.object({
      role: z.literal("user"),
      content: z.string(),
      images: z.array(z.object({ mime: z.string(), dataBase64: z.string() })).optional(),
    }),
    z.object({
      role: z.literal("assistant"),
      content: z.string(),
      toolCalls: z
        .array(z.object({ id: z.string(), name: z.string(), arguments: z.record(z.unknown()) }))
        .optional(),
    }),
    z.object({
      role: z.literal("tool"),
      toolCallId: z.string(),
      name: z.string(),
      content: z.string(),
    }),
  ]),
) as z.ZodType<Message>;

const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  started: z.string(),
  updated: z.string(),
  messages: z.array(MessageSchema),
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionMeta = Pick<Session, "id" | "title" | "started" | "updated"> & {
  turns: number;
};

/** Home-relative path to a session's JSON file. */
function sessionRel(id: string): string {
  return `${SESSIONS_SUBDIR}/${id}.json`;
}

/** Timestamp-based id `YYYYMMDD-HHMMSS`. `now` injectable for tests. */
export function newSessionId(now: Date = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

/** First user message, trimmed, as a human title. */
function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.content.trim().replace(/\s+/g, " ") ?? "(empty session)";
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Write (create or overwrite) a session. Best-effort caller-side; throws only on fs errors. */
export async function saveSession(
  id: string,
  messages: Message[],
  opts: { env?: NodeJS.ProcessEnv; now?: string; started?: string; title?: string } = {},
): Promise<void> {
  const now = opts.now ?? new Date().toISOString();
  const session: Session = {
    id,
    // Explicit /title override wins; otherwise derive from the first user message.
    title: opts.title?.trim() || deriveTitle(messages),
    started: opts.started ?? now,
    updated: now,
    messages,
  };
  await resolveMemoryStore(opts.env).write(sessionRel(id), JSON.stringify(session, null, 2));
}

/** Load a session by id, or null if missing/corrupt. */
export async function loadSession(
  id: string,
  env?: NodeJS.ProcessEnv,
): Promise<Session | null> {
  const content = await resolveMemoryStore(env).read(sessionRel(id));
  if (content === null) return null;
  try {
    const raw: unknown = JSON.parse(content);
    const parsed = SessionSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Create a new session seeded with an existing session's messages. */
export async function forkSession(
  sourceId: string,
  opts: { env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<Session | null> {
  const source = await loadSession(sourceId, opts.env);
  if (!source) return null;
  const now = opts.now ?? new Date();
  const id = newSessionId(now);
  const started = now.toISOString();
  await saveSession(id, source.messages, { env: opts.env, now: started, started, title: source.title });
  return loadSession(id, opts.env);
}

/** Delete a session file. Idempotent — a missing file is not an error. */
export async function deleteSession(id: string, env?: NodeJS.ProcessEnv): Promise<void> {
  await resolveMemoryStore(env).remove(sessionRel(id));
}

/** List session metadata, newest first. Skips unparseable files. */
export async function listSessions(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
  const files = (await resolveMemoryStore(env).list(SESSIONS_SUBDIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const metas: SessionMeta[] = [];
  for (const file of files) {
    const session = await loadSession(file.replace(/\.json$/, ""), env);
    if (!session) continue;
    metas.push({
      id: session.id,
      title: session.title,
      started: session.started,
      updated: session.updated,
      turns: session.messages.filter((m) => m.role === "user").length,
    });
  }
  return metas.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** The default fs-JSON session store — the only adapter today. */
export const fsSessionStore: SessionStore = {
  saveSession,
  loadSession,
  forkSession,
  deleteSession,
  listSessions,
};
