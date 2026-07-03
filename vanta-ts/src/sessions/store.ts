import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import type { Message } from "../types.js";

// Session persistence behind a SessionStore PORT (PORT-SESSION-STORE). The default
// adapter (createFsSessionStore) writes one JSON file per session under
// ~/.vanta/sessions/<id>.json — dependency-free, git-versionable, and consistent with
// how skills/memory are stored; enough for a single-user CLI. An alternate store
// (SQLite/remote/encrypted/in-memory) implements the same interface and replaces it
// with no edits to any caller. The free saveSession/loadSession/listSessions/... fns
// are thin delegators over the default fs store, so existing callers stay unchanged.

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
  // Origin project (canonicalProjectId). Optional + additive: sessions saved
  // before this field still load. Enables cross-project resume (see cross-project.ts).
  projectId: z.string().optional(),
  messages: z.array(MessageSchema),
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionMeta = Pick<Session, "id" | "title" | "started" | "updated" | "projectId"> & {
  turns: number;
};

/** Options for writing a session. The store binds its own location, so `env` is not
 *  a per-call field here (the delegator saveSession accepts it and passes it through). */
export type SaveSessionOpts = { now?: string; started?: string; title?: string; projectId?: string };

/**
 * The session persistence port. createFsSessionStore is the default (fs-JSON) adapter;
 * an alternate store — DB, remote, encrypted, in-memory — implements this interface and
 * replaces it without any caller edits. (PORT-SESSION-STORE)
 */
export interface SessionStore {
  save(id: string, messages: Message[], opts?: SaveSessionOpts): Promise<void>;
  load(id: string): Promise<Session | null>;
  list(): Promise<SessionMeta[]>;
  delete(id: string): Promise<void>;
}

function sessionsDir(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), SESSIONS_SUBDIR);
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

/** Session → listing metadata (turn count = number of user messages). */
function toMeta(session: Session): SessionMeta {
  return {
    id: session.id,
    title: session.title,
    started: session.started,
    updated: session.updated,
    projectId: session.projectId,
    turns: session.messages.filter((m) => m.role === "user").length,
  };
}

/**
 * The default adapter: one JSON file per session under <vanta-home>/sessions/<id>.json.
 * Bind it to an env (which resolves the vanta home) once; the methods carry no env.
 */
export function createFsSessionStore(env?: NodeJS.ProcessEnv): SessionStore {
  const dir = sessionsDir(env);

  const load: SessionStore["load"] = async (id) => {
    try {
      const raw: unknown = JSON.parse(await readFile(join(dir, `${id}.json`), "utf8"));
      const parsed = SessionSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  const save: SessionStore["save"] = async (id, messages, opts = {}) => {
    await mkdir(dir, { recursive: true });
    const now = opts.now ?? new Date().toISOString();
    const session: Session = {
      id,
      // Explicit /title override wins; otherwise derive from the first user message.
      title: opts.title?.trim() || deriveTitle(messages),
      started: opts.started ?? now,
      updated: now,
      // Origin project — additive; omitted when not provided so old sessions stay byte-identical.
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      messages,
    };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(session, null, 2), "utf8");
  };

  const list: SessionStore["list"] = async () => {
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const metas: SessionMeta[] = [];
    for (const file of files) {
      const session = await load(file.replace(/\.json$/, ""));
      if (session) metas.push(toMeta(session));
    }
    return metas.sort((a, b) => b.updated.localeCompare(a.updated));
  };

  const del: SessionStore["delete"] = async (id) => {
    await rm(join(dir, `${id}.json`), { force: true });
  };

  return { save, load, list, delete: del };
}

/** Write (create or overwrite) a session via the default fs store. Best-effort
 *  caller-side; throws only on fs errors. */
export async function saveSession(
  id: string,
  messages: Message[],
  opts: SaveSessionOpts & { env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return createFsSessionStore(opts.env).save(id, messages, opts);
}

/** Load a session by id, or null if missing/corrupt. */
export async function loadSession(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return createFsSessionStore(env).load(id);
}

/** Delete a session file. Idempotent — a missing file is not an error. */
export async function deleteSession(id: string, env?: NodeJS.ProcessEnv): Promise<void> {
  return createFsSessionStore(env).delete(id);
}

/** List session metadata, newest first. Skips unparseable files. */
export async function listSessions(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
  return createFsSessionStore(env).list();
}

/** Create a new session seeded with an existing session's messages. */
export async function forkSession(
  sourceId: string,
  opts: { env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<Session | null> {
  const store = createFsSessionStore(opts.env);
  const source = await store.load(sourceId);
  if (!source) return null;
  const now = opts.now ?? new Date();
  const id = newSessionId(now);
  const started = now.toISOString();
  await store.save(id, source.messages, { now: started, started, title: source.title });
  return store.load(id);
}
