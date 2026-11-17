import { describe, expect, it } from 'vitest'

import { makeSessionInfo } from '@/test/session-info'

import { buildProfileSessionGroups } from './gateway-group-model'

const members = (groups: ReturnType<typeof buildProfileSessionGroups>) =>
  Object.fromEntries(groups.map(group => [group.label, group.sessions.map(session => session.id)]))

describe('buildProfileSessionGroups', () => {
  it('makes one plain group per profile, whatever connection a row names', () => {
    const groups = buildProfileSessionGroups(
      [
        makeSessionInfo({ id: 'a', connection_id: 'local', profile: 'default' }),
        makeSessionInfo({ id: 'b', connection_id: 'remote-1', profile: 'default' }),
        makeSessionInfo({ id: 'c', profile: 'research' }),
        makeSessionInfo({ id: 'd', profile: undefined })
      ],
      {}
    )

    expect(members(groups)).toEqual({ default: ['a', 'b', 'd'], research: ['c'] })
  })

  it('never labels a group with a gateway or sets a connection', () => {
    const groups = buildProfileSessionGroups([makeSessionInfo({ id: 'a', connection_id: 'remote-1', profile: 'default' })], {})

    expect(groups[0]?.label).toBe('default')
    expect(groups[0]?.connectionId).toBeNull()
    expect(groups[0]?.mode).toBe('profile')
  })

  it('returns groups in name order', () => {
    const groups = buildProfileSessionGroups(
      [makeSessionInfo({ id: 'a', profile: 'zeta' }), makeSessionInfo({ id: 'b', profile: 'alpha' })],
      {}
    )

    expect(groups.map(group => group.label)).toEqual(['alpha', 'zeta'])
  })
})
