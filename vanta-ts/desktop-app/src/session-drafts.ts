export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type DraftContext = { root: string; sessionId: string };
type DraftUpdater = string | ((current: string) => string);

const DRAFT_PREFIX = "vanta.desktop.session-draft.v1";

export function hasPersistableSessionDraftContext(sessionId: string): boolean {
  return sessionId.trim().length > 0;
}

export function sessionDraftKey(root: string, sessionId: string): string {
  return `${DRAFT_PREFIX}:${encodeURIComponent(root || "unknown-project")}:${encodeURIComponent(sessionId || "new-task")}`;
}

export function loadSessionDraft(storage: DraftStorage, root: string, sessionId: string): string {
  try {
    return storage.getItem(sessionDraftKey(root, sessionId)) ?? "";
  } catch {
    return "";
  }
}

export function saveSessionDraft(storage: DraftStorage, root: string, sessionId: string, value: string): void {
  try {
    const key = sessionDraftKey(root, sessionId);
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // Draft persistence is best-effort; the composer remains usable in memory.
  }
}

export function createSessionDraftController(storage: DraftStorage, root = "", sessionId = "") {
  let context: DraftContext = { root, sessionId };
  let value = loadSessionDraft(storage, root, sessionId);

  return {
    context: (): DraftContext => ({ ...context }),
    value: (): string => value,
    activate(nextRoot: string, nextSessionId: string): string {
      context = { root: nextRoot, sessionId: nextSessionId };
      value = loadSessionDraft(storage, nextRoot, nextSessionId);
      return value;
    },
    update(updater: DraftUpdater): string {
      value = typeof updater === "function" ? updater(value) : updater;
      saveSessionDraft(storage, context.root, context.sessionId, value);
      return value;
    },
    clear(targetRoot: string, targetSessionId: string): void {
      saveSessionDraft(storage, targetRoot, targetSessionId, "");
      if (context.root === targetRoot && context.sessionId === targetSessionId) value = "";
    },
  };
}
