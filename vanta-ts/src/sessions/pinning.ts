import { listAllSessions, loadSession, saveSession, type SaveSessionOpts, type Session, type SessionMeta } from "./store.js";

function preservedOptions(session: Session, env: NodeJS.ProcessEnv | undefined, pinned: boolean, pinOrder?: number): SaveSessionOpts & { env?: NodeJS.ProcessEnv } {
  return {
    env,
    started: session.started,
    updated: session.updated,
    title: session.title,
    projectId: session.projectId,
    providerId: session.providerId,
    modelId: session.modelId,
    archived: session.archived,
    trashed: session.trashed,
    pinned,
    pinOrder,
  };
}

function comparePinned(a: SessionMeta, b: SessionMeta): number {
  return (a.pinOrder ?? Number.MAX_SAFE_INTEGER) - (b.pinOrder ?? Number.MAX_SAFE_INTEGER)
    || b.updated.localeCompare(a.updated)
    || a.id.localeCompare(b.id);
}

export async function setSessionPinned(id: string, pinned: boolean, env?: NodeJS.ProcessEnv): Promise<Session | null> {
  const session = await loadSession(id, env);
  if (!session || session.trashed) return null;
  const all = await listAllSessions(env);
  const nextOrder = pinned
    ? Math.max(-1, ...all.filter((item) => item.pinned).map((item) => item.pinOrder ?? -1)) + 1
    : undefined;
  await saveSession(id, session.messages, preservedOptions(session, env, pinned, pinned ? session.pinOrder ?? nextOrder : undefined));
  return loadSession(id, env);
}

export async function reorderPinnedSessions(orderedIds: string[], env?: NodeJS.ProcessEnv): Promise<SessionMeta[] | null> {
  const all = await listAllSessions(env);
  const pinned = all.filter((session) => session.pinned).sort(comparePinned);
  const active = pinned.filter((session) => !session.archived && !session.trashed);
  if (new Set(orderedIds).size !== orderedIds.length) return null;
  if (active.length !== orderedIds.length || active.some((session) => !orderedIds.includes(session.id))) return null;
  const ordered = new Map(orderedIds.map((id, index) => [id, index]));
  const reorderedActive = [...active].sort((a, b) => (ordered.get(a.id) ?? 0) - (ordered.get(b.id) ?? 0));
  let activeIndex = 0;
  const merged = pinned.map((session) => session.archived ? session : reorderedActive[activeIndex++] ?? session);
  await Promise.all(merged.map(async (meta, pinOrder) => {
    const session = await loadSession(meta.id, env);
    if (session) await saveSession(session.id, session.messages, preservedOptions(session, env, true, pinOrder));
  }));
  return (await listAllSessions(env)).filter((session) => session.pinned).sort(comparePinned);
}
