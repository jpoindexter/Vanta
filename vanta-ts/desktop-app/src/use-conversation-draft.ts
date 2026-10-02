import { useCallback,useEffect,useRef,useState } from "react";
import { api } from "./api.js";
import { postJson } from "./request-json.js";
import { createSessionDraftController,hasPersistableSessionDraftContext } from "./session-drafts.js";
import { useDraftPersistence } from "./use-draft-persistence.js";

export function useConversationDraft(projectRoot: string, sessionId: string) {
  const draftController = useRef(createSessionDraftController(window.localStorage, projectRoot, ""));
  const [draft, setDraftState] = useState(() => draftController.current.value());
  const draftPersistence = useDraftPersistence();
  const persistDraft = draftPersistence.persist;
  const activateDraft = useCallback(async (nextSessionId: string, isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return;
    const local = draftController.current.activate(projectRoot, nextSessionId);
    setDraftState(local);
    if (!hasPersistableSessionDraftContext(nextSessionId)) return;
    await draftPersistence.flush();
    if (!isCurrent()) return;
    const stored = await api<{ exists: boolean; value: string }>("/api/sessions/draft", postJson({ action: "load", id: nextSessionId })).catch(() => null);
    const context = draftController.current.context();
    if (!stored || !isCurrent() || context.root !== projectRoot || context.sessionId !== nextSessionId) return;
    if (!stored.exists && local) {
      await persistDraft(nextSessionId, local);
      return;
    }
    draftController.current.update(stored.value);
    setDraftState(stored.value);
  }, [projectRoot]);
  const setDraft = useCallback((updater: string | ((value: string) => string)) => {
    const value = draftController.current.update(updater);
    setDraftState(value);
    const id = draftController.current.context().sessionId;
    if (id) void persistDraft(id, value);
  }, [persistDraft]);
  const clearDraftFor = useCallback(async (id: string) => {
    draftController.current.clear(projectRoot, id);
    await persistDraft(id, "");
  }, [persistDraft, projectRoot]);
  useEffect(() => {
    void activateDraft(sessionId).catch(() => undefined);
  }, [projectRoot]);
  return { draft, setDraft, activateDraft, clearDraftFor,
    draftStatus: draftPersistence.status, draftError: draftPersistence.error, flushDraft: draftPersistence.flush,
    retryDraft: () => persistDraft(sessionId, draftController.current.value()) };
}
