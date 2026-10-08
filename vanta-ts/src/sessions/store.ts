import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { resolveVantaHome } from "../store/home.js";
import type { Message } from "../types.js";
import { reconcileDanglingToolResults } from "../agent/effect-disposition.js";
import { deleteUnsavedRunsForSession } from "../runs/store.js";
import { SessionSchema, type Session, type SessionMeta, type SaveSessionOpts } from "./session-schema.js";
import { assertSessionDirectory, atomicReplaceSessionFile, readSessionBytes, sessionFilePath, SessionStoreConflictError, SessionStoreUnreadableError, withSessionLock, writeSessionBytes } from "./atomic-persistence.js";
export { SessionStoreConflictError, SessionStoreUnreadableError } from "./atomic-persistence.js";

const SESSIONS_SUBDIR = "sessions";

export { type Session, type SessionMeta, type SaveSessionOpts } from "./session-schema.js";

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

async function readRawSession(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return parseSessionBytes(await readSessionBytes(sessionPath(id, env)), id, sessionPath(id, env));
}

function sessionPath(id: string, env?: NodeJS.ProcessEnv): string {
  return sessionFilePath(sessionsDir(env), id);
}

function parseSessionBytes(bytes: string | null, id: string, path: string): Session | null {
  if (bytes === null) return null;
  try {
    const parsed = SessionSchema.safeParse(JSON.parse(bytes));
    if (!parsed.success || parsed.data.id !== id) throw new Error("schema or identity mismatch");
    return parsed.data;
  } catch { throw new SessionStoreUnreadableError(path, "invalid JSON, schema or session identity"); }
}

async function persistSession(path: string, session: Session): Promise<void> {
  const previous = await readSessionBytes(path);
  parseSessionBytes(previous, session.id, path);
  await writeSessionBytes(path, JSON.stringify(SessionSchema.parse(session), null, 2), previous);
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
    providerId: session.providerId,
    modelId: session.modelId,
    archived: session.archived,
    trashed: session.trashed,
    pinned: session.pinned,
    pinOrder: session.pinOrder,
    turns: session.messages.filter((m) => m.role === "user").length,
  };
}

/** Default failure-atomic JSON adapter bound once to its Vanta home. */
export function createFsSessionStore(env?: NodeJS.ProcessEnv): SessionStore {
  return {
    save: (id, messages, opts) => withSessionLock(sessionPath(id, env), () => saveUnlocked(id, messages, opts ?? {}, env)),
    load: (id) => loadAndReconcile(id, env),
    list: () => listMetadata(env),
    delete: (id) => withSessionLock(sessionPath(id, env), async () => {
      await rm(sessionPath(id, env), { force: true });
      await rm(`${sessionPath(id, env)}.last-good`, { force: true });
    }),
  };
}

function buildSession(id: string, messages: Message[], opts: SaveSessionOpts): Session {
  const now = opts.now ?? new Date().toISOString();
  return {
    id, title: opts.title?.trim() || deriveTitle(messages), started: opts.started ?? now, updated: opts.updated ?? now,
    ...sessionMetadata(opts), messages,
  };
}

function sessionMetadata(opts: SaveSessionOpts): Partial<Session> {
  return {
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(opts.providerId ? { providerId: opts.providerId } : {}), ...(opts.modelId ? { modelId: opts.modelId } : {}),
    ...(opts.archived ? { archived: true } : {}), ...(opts.trashed ? { trashed: true } : {}),
    ...(opts.pinned ? { pinned: true, pinOrder: opts.pinOrder ?? 0 } : {}),
  };
}

async function saveUnlocked(id: string, messages: Message[], opts: SaveSessionOpts, env?: NodeJS.ProcessEnv): Promise<void> {
  const existing = await readRawSession(id, env);
  if (opts.expectedVersion !== undefined && opts.expectedVersion !== (existing ? sessionVersion(existing) : null)) {
    throw new SessionStoreConflictError(sessionPath(id, env), "session changed since snapshot");
  }
  const overrides = Object.fromEntries(Object.entries(opts).filter(([, value]) => value !== undefined)) as SaveSessionOpts;
  const options = existing ? { ...existingSaveOptions(existing), ...overrides } : overrides;
  if (existing && !opts.title && ["New chat", "(empty session)"].includes(existing.title)) options.title = deriveTitle(messages);
  await persistSession(sessionPath(id, env), buildSession(id, messages, options));
}

/** Stable version precondition without changing the persisted session schema. */
export function sessionVersion(session: Session): string {
  return createHash("sha256").update(JSON.stringify(SessionSchema.parse(session))).digest("hex");
}

async function loadAndReconcile(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  const session = await readRawSession(id, env);
  if (!session || reconcileDanglingToolResults(session.messages).added === 0) return session;
  return withSessionLock(sessionPath(id, env), async () => {
    const latest = await readRawSession(id, env);
    if (!latest) return null;
    const recovered = reconcileDanglingToolResults(latest.messages);
    if (recovered.added > 0) {
      latest.messages = recovered.messages;
      await persistSession(sessionPath(id, env), latest);
    }
    return latest;
  });
}

async function listMetadata(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
  const dir = sessionsDir(env);
  let files: string[];
  try { await assertSessionDirectory(dir); files = (await readdir(dir)).filter((file) => file.endsWith(".json")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new SessionStoreUnreadableError(dir, "session directory cannot be listed");
  }
  const metas: SessionMeta[] = [];
  for (const file of files) {
    const id = file.slice(0, -5);
    try { const session = await readRawSession(id, env); if (session) metas.push(toMeta(session)); }
    catch (error) {
      if (!(error instanceof SessionStoreUnreadableError)) throw error;
      metas.push({ id, title: `Session needs recovery: ${id}`, started: "", updated: "", turns: 0,
        diagnostic: { code: error.code, path: error.path, recovery: error.recovery } });
    }
  }
  return metas.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Save a session; errors and optional stale-version preconditions reach the caller. */
export async function saveSession(
  id: string,
  messages: Message[],
  opts: SaveSessionOpts & { env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return createFsSessionStore(opts.env).save(id, messages, opts);
}

/** Mid-turn durability checkpoint preserving existing session metadata when present. */
export async function checkpointSessionMessages(
  id: string,
  messages: Message[],
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  // A live checkpoint must not invoke restore-time reconciliation: a pending
  // tool call is valid while the turn is still running.
  await withSessionLock(sessionPath(id, env), () => saveUnlocked(id, messages, {}, env));
}

/** Absent sessions return null; corruption/unreadability raises an actionable diagnostic. */
export async function loadSession(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return createFsSessionStore(env).load(id);
}

/** Delete a session and any disposable run records linked to it. Saved runs
 *  intentionally survive until the operator deletes them explicitly. */
export async function deleteSession(id: string, env?: NodeJS.ProcessEnv): Promise<void> {
  await createFsSessionStore(env).delete(id);
  await deleteUnsavedRunsForSession(id, env);
}

/** List active session metadata plus recoverable-entry diagnostics; never writes. */
export async function listSessions(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
  return (await createFsSessionStore(env).list()).filter((session) => !session.archived && !session.trashed);
}

/** List active and archived session metadata, newest first. */
export async function listAllSessions(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
  return createFsSessionStore(env).list();
}

function existingSaveOptions(session: Session, overrides: Pick<SaveSessionOpts, "title" | "archived" | "trashed" | "pinned" | "pinOrder" | "updated"> = {}): SaveSessionOpts {
  return {
    started: session.started,
    updated: overrides.updated,
    title: overrides.title ?? session.title,
    projectId: session.projectId,
    providerId: session.providerId,
    modelId: session.modelId,
    archived: overrides.archived ?? session.archived,
    trashed: overrides.trashed ?? session.trashed,
    pinned: overrides.pinned ?? session.pinned,
    pinOrder: overrides.pinOrder ?? session.pinOrder,
  };
}

/** Rename a persisted session without changing its transcript or routing metadata. */
export async function renameSession(id: string, title: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return updateSession(id, env, (session) => existingSaveOptions(session, { title }));
}

/** Archive or restore a session while preserving its original ordering timestamp. */
export async function setSessionArchived(id: string, archived: boolean, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return updateSession(id, env, (session) => existingSaveOptions(session, { archived, updated: session.updated }));
}

/** Move a session into recoverable trash or restore it without changing its transcript. */
export async function setSessionTrashed(id: string, trashed: boolean, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  return updateSession(id, env, (session) => existingSaveOptions(session, { trashed,
    archived: trashed ? false : session.archived, pinned: trashed ? false : session.pinned,
    pinOrder: trashed ? undefined : session.pinOrder, updated: session.updated }));
}

async function updateSession(id: string, env: NodeJS.ProcessEnv | undefined, options: (session: Session) => SaveSessionOpts): Promise<Session | null> {
  return withSessionLock(sessionPath(id, env), async () => {
    const existing = await readRawSession(id, env);
    if (!existing) return null;
    const next = buildSession(id, reconcileDanglingToolResults(existing.messages).messages, options(existing));
    await persistSession(sessionPath(id, env), next);
    return next;
  });
}

/** Inspect a validated last-good candidate without changing the live source. */
export async function readSessionRecovery(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  const path = `${sessionPath(id, env)}.last-good`;
  return parseSessionBytes(await readSessionBytes(path), id, path);
}

/** Explicit recovery retains suspect bytes separately before restoring the last-good candidate. */
export async function recoverSession(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  const path = sessionPath(id, env);
  return withSessionLock(path, async () => {
    const candidate = await readSessionRecovery(id, env);
    if (!candidate) return null;
    const suspect = await readSessionBytes(path);
    if (suspect !== null && validSessionBytes(suspect, id, path)) throw new SessionStoreConflictError(path, "Healthy session does not need recovery");
    if (suspect !== null) await atomicReplaceSessionFile(`${path}.suspect-${randomUUID()}`, suspect);
    await atomicReplaceSessionFile(path, JSON.stringify(candidate, null, 2));
    return candidate;
  });
}

function validSessionBytes(bytes: string, id: string, path: string): boolean {
  try { parseSessionBytes(bytes, id, path); return true; }
  catch (error) { if (error instanceof SessionStoreUnreadableError) return false; throw error; }
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
  await store.save(id, source.messages, { now: started, started, title: source.title, providerId: source.providerId, modelId: source.modelId });
  return store.load(id);
}
