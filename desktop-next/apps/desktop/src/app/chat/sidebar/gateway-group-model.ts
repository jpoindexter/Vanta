import { useMemo } from 'react'
import { useStore } from '@nanostores/react'

import type { SessionInfo } from '@/hermes'
import { resolveProfileColor } from '@/lib/profile-color'
import { $profileColors, normalizeProfileKey } from '@/store/profile'

import type { SidebarSessionGroup } from './projects/workspace-groups'

/** One plain group per profile. Vanta runs one local backend, so there are no
 *  gateway or fleet headers: a group is a profile and nothing else. */
export function buildProfileSessionGroups(sessions: SessionInfo[], colors: Record<string, string>): SidebarSessionGroup[] {
  const groups = new Map<string, SidebarSessionGroup>()

  for (const session of sessions) {
    const profile = normalizeProfileKey(session.profile)
    const id = JSON.stringify([null, profile])

    const group: SidebarSessionGroup = groups.get(id) ?? {
      id,
      label: profile,
      connectionId: null,
      profile,
      mode: 'profile',
      path: null,
      color: resolveProfileColor(profile, colors),
      sessions: []
    }

    group.sessions.push(session)
    groups.set(id, group)
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

export function useProfileSessionGroups(sessions: SessionInfo[], enabled: boolean) {
  const colors = useStore($profileColors)

  return useMemo(() => (enabled ? buildProfileSessionGroups(sessions, colors) : undefined), [sessions, enabled, colors])
}
