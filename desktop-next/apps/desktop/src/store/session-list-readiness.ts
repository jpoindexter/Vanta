import { atom } from 'nanostores'

import type { SidebarSessionsResponse } from '@/api/sessions'

// Row identity stays stable on an empty/unchanged read; readiness is a separate fact.
export const $sessionListLoaded = atom(false)

export function acknowledgeSessionListRead(result: SidebarSessionsResponse): void {
  const { recents } = result
  if (!Array.isArray(recents.sessions) || recents.failed || recents.retry) return
  const failures = [
    recents.errors,
    result.errors,
    Object.keys(result.storage ?? {}),
    Object.keys(recents.profiles_failed ?? {}),
    Object.keys(result.profiles_failed ?? {})
  ]
  if (failures.some((entries) => entries?.length)) return
  $sessionListLoaded.set(true)
}
