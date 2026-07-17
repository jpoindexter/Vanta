import type { Session } from "./types.js";

function comparePinned(a: Session, b: Session): number {
  return (a.pinOrder ?? Number.MAX_SAFE_INTEGER) - (b.pinOrder ?? Number.MAX_SAFE_INTEGER)
    || b.updated.localeCompare(a.updated)
    || a.id.localeCompare(b.id);
}

export function partitionSessions(sessions: Session[]) {
  const active = sessions.filter((session) => !session.archived && !session.trashed);
  const pinned = active.filter((session) => session.pinned).sort(comparePinned);
  const unpinned = active.filter((session) => !session.pinned);
  return {
    active,
    pinned,
    project: unpinned.slice(0, 3),
    recent: unpinned.slice(3),
    archived: sessions.filter((session) => session.archived && !session.trashed),
    trashed: sessions.filter((session) => session.trashed),
  };
}

export function movePinnedSession(pinned: Session[], id: string, delta: -1 | 1): string[] {
  const ids = pinned.map((session) => session.id);
  const from = ids.indexOf(id);
  const to = Math.max(0, Math.min(ids.length - 1, from + delta));
  if (from < 0 || from === to) return ids;
  const [moved] = ids.splice(from, 1);
  if (moved) ids.splice(to, 0, moved);
  return ids;
}
