import type { DesktopRunReceipt, Message, Session } from "./types.js";

export function currentRecovery(messages: Message[], recovery: DesktopRunReceipt | null): DesktopRunReceipt | null {
  const latest = [...messages].reverse().find((message) => message.desktopRun)?.desktopRun;
  return latest?.status === "done" ? null : recovery;
}

export function shellMode(search: string): "chat" | "classic" {
  return new URLSearchParams(search).get("shell") === "classic" ? "classic" : "chat";
}

export function chatTitle(session: Pick<Session, "title">): string {
  return !session.title || ["New session", "(empty session)"].includes(session.title) ? "New chat" : session.title;
}

type SelectionStorage = Pick<Storage, "getItem" | "setItem">;
const selectionKey = (root: string) => `vanta.desktop.selected-chat.v1:${encodeURIComponent(root)}`;

export function rememberChatSelection(storage: SelectionStorage, root: string, id: string): void {
  if (!root || !id) return;
  try { storage.setItem(selectionKey(root), id); } catch { /* Selection is optional; canonical sessions remain discoverable. */ }
}

export function restoreChatSelection(storage: SelectionStorage, root: string, sessions: Session[]): string | undefined {
  try {
    const id = storage.getItem(selectionKey(root));
    return sessions.find((session) => session.id === id && !session.trashed && !session.archived)?.id;
  } catch { return undefined; }
}

export function chatGroups(sessions: Session[], query: string, archived: boolean) {
  const matching = sessions.filter((session) => !session.trashed
    && Boolean(session.archived) === archived
    && chatTitle(session).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const recent = matching.filter((session) => archived || !session.pinned)
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id));
  const pinned = archived ? [] : matching.filter((session) => session.pinned)
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0) || a.id.localeCompare(b.id));
  return { pinned, recent };
}
