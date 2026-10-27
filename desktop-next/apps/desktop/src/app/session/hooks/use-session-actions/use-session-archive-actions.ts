import { useCallback } from 'react'

import { archiveStoredSession, restoreArchivedSession, type SessionArchiveOptions } from './session-archive'

/** Archive/restore retain the existing callback identities and read mutable refs at action time. */
export function useSessionArchiveActions({
  copy,
  runtimeIdByStoredSessionIdRef,
  selectedStoredSessionIdRef,
  sessionStateByRuntimeIdRef,
  startFreshSessionDraft
}: SessionArchiveOptions) {
  const archiveSession = useCallback(
    (storedSessionId: string) =>
      archiveStoredSession(storedSessionId, {
        copy,
        runtimeIdByStoredSessionIdRef,
        selectedStoredSessionIdRef,
        sessionStateByRuntimeIdRef,
        startFreshSessionDraft
      }),
    [
      copy,
      runtimeIdByStoredSessionIdRef,
      selectedStoredSessionIdRef,
      sessionStateByRuntimeIdRef,
      startFreshSessionDraft
    ]
  )
  const unarchiveSession = useCallback(
    (storedSessionId: string) => restoreArchivedSession(storedSessionId, copy),
    [copy]
  )
  return { archiveSession, unarchiveSession }
}
