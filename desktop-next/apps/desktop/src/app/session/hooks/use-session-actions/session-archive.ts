import type { MutableRefObject } from 'react'

import { setSessionArchived } from '@/desktop-api'
import type { Translations } from '@/i18n'
import { $pinnedSessionIds } from '@/store/layout'
import { clearNotifications, notify, notifyError } from '@/store/notifications'
import { $profiles } from '@/store/profile'
import { sessionPinId } from '@/store/session'
import {
  beginSessionMutation,
  endSessionMutation,
  tombstoneSessions,
  untombstoneSessions
} from '@/store/session-removal'
import { closeSessionTile, dropSessionState } from '@/store/session-states'
import { forgetSessionUnread } from '@/store/session-unread'
import { $archivedSessions } from '@/store/sidebar-archive'

import type { ClientSessionState } from '../../../types'
import {
  dropListedSession,
  findListedSession,
  resolveSessionProfile,
  restoreListedSession,
  sessionMatchesStoredId
} from './utils'

export type SessionArchiveCopy = Pick<
  Translations['desktop'],
  'archived' | 'archiveFailed' | 'restored' | 'unarchiveFailed'
>

export interface SessionArchiveOptions {
  copy: SessionArchiveCopy
  runtimeIdByStoredSessionIdRef: MutableRefObject<Map<string, string>>
  selectedStoredSessionIdRef: MutableRefObject<string | null>
  sessionStateByRuntimeIdRef: MutableRefObject<Map<string, ClientSessionState>>
  startFreshSessionDraft: (replaceRoute: boolean) => void
}

type ListedSession = ReturnType<typeof findListedSession>
interface ArchiveSnapshot {
  previousPinned: string[]
  archivedIds: Array<null | string | undefined>
}

function canArchive(
  listed: ListedSession,
  stampedProfile: string | undefined,
  profile: string | undefined,
  copy: SessionArchiveCopy
): boolean {
  if (listed && !stampedProfile && !profile?.trim() && $profiles.get().filter((item) => item.name.trim()).length > 1) {
    notifyError(new Error('Session ownership could not be resolved'), copy.archiveFailed)
    return false
  }
  return true
}

function hideArchivedSession(storedSessionId: string, listed: ListedSession): ArchiveSnapshot {
  const archived = listed?.session
  const previousPinned = $pinnedSessionIds.get()
  // Pins use the durable lineage root; the stored ID can be a compressed live tip.
  const archivedPinId = archived ? sessionPinId(archived) : storedSessionId
  const archivedIds = [storedSessionId, archived?.id, archived?._lineage_root_id]
  dropListedSession(storedSessionId)
  tombstoneSessions(archivedIds)
  beginSessionMutation(archivedIds)
  $pinnedSessionIds.set(previousPinned.filter((id) => id !== storedSessionId && id !== archivedPinId))
  return { previousPinned, archivedIds }
}

function finishArchivedSession(
  storedSessionId: string,
  profile: string | undefined,
  snapshot: ArchiveSnapshot,
  options: SessionArchiveOptions
): void {
  // Clear unread only after the RPC, so failed archives retain it.
  forgetSessionUnread(snapshot.archivedIds, profile)
  const tiledRuntimeId = options.runtimeIdByStoredSessionIdRef.current.get(storedSessionId)
  closeSessionTile(storedSessionId)
  if (tiledRuntimeId) {
    options.runtimeIdByStoredSessionIdRef.current.delete(storedSessionId)
    options.sessionStateByRuntimeIdRef.current.delete(tiledRuntimeId)
    dropSessionState(tiledRuntimeId)
  }
  notify({
    durationMs: 2_000,
    kind: 'success',
    message: options.copy.archived
  })
}

function restoreFailedArchive(listed: ListedSession, snapshot: ArchiveSnapshot): void {
  if (listed?.session) restoreListedSession(listed.session, listed.slice)
  untombstoneSessions(snapshot.archivedIds)
  $pinnedSessionIds.set(snapshot.previousPinned)
}

export async function archiveStoredSession(storedSessionId: string, options: SessionArchiveOptions): Promise<void> {
  const { copy, selectedStoredSessionIdRef, startFreshSessionDraft } = options
  clearNotifications()
  const listed = findListedSession(storedSessionId)
  const stampedProfile = listed?.session.profile?.trim()
  const profile = stampedProfile || (await resolveSessionProfile(storedSessionId))
  if (!canArchive(listed, stampedProfile, profile, copy)) return
  const wasSelected = selectedStoredSessionIdRef.current === storedSessionId
  const snapshot = hideArchivedSession(storedSessionId, listed)
  if (wasSelected) startFreshSessionDraft(true)
  try {
    await setSessionArchived(storedSessionId, true, profile)
    finishArchivedSession(storedSessionId, profile, snapshot, options)
  } catch (err) {
    restoreFailedArchive(listed, snapshot)
    notifyError(err, copy.archiveFailed)
  } finally {
    endSessionMutation(snapshot.archivedIds)
  }
}

/** The Archived sidebar and Settings restore share the same stored flag and slice router. */
export async function restoreArchivedSession(storedSessionId: string, copy: SessionArchiveCopy): Promise<void> {
  clearNotifications()
  const archived = $archivedSessions.get().find((session) => sessionMatchesStoredId(session, storedSessionId))
  const profile = archived?.profile?.trim() || undefined
  try {
    await setSessionArchived(storedSessionId, false, profile)
    // Drop the archived-view row even when its profile is outside the current list query.
    $archivedSessions.set(
      $archivedSessions.get().filter((session) => !sessionMatchesStoredId(session, storedSessionId))
    )
    if (archived) {
      untombstoneSessions([storedSessionId, archived._lineage_root_id])
      restoreListedSession({ ...archived, archived: false })
    }
    notify({ durationMs: 2_000, kind: 'success', message: copy.restored })
  } catch (err) {
    notifyError(err, copy.unarchiveFailed)
  }
}
