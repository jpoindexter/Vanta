import { $projectTree } from '@/store/projects'
import { ownerLookupSessionRows, sessionMatchesStoredId } from '@/store/session'
import type { SessionInfo } from '@/types/desktop'

/** Include messaging/cron slices and older project-tree rows outside recents. */
export function tileStoredRow(storedSessionId: string): SessionInfo | undefined {
  const match = (session: SessionInfo) => sessionMatchesStoredId(session, storedSessionId)
  return (
    ownerLookupSessionRows().find(match) ??
    $projectTree.get()
      .flatMap(project => [...project.repos.flatMap(repo => repo.groups.flatMap(group => group.sessions)), ...(project.previewSessions ?? [])])
      .find(match)
  )
}
