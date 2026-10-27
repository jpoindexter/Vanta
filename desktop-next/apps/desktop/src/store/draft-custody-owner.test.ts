import { afterEach, beforeEach, expect, it } from 'vitest'

import { captureDraftCustodyOwner } from './draft-custody-owner'
import { $activeGatewayProfile } from './profile'
import { $connection, _resetSessionOwnerHintsForTests, setSessionOwnerHint } from './session'

const originalConnection = $connection.get(), originalProfile = $activeGatewayProfile.get()
const session = 'same-stored-id'
const local = { connectionId: 'local', profile: 'default' }
const recorded = { connectionId: 'connection-created-chat', profile: 'work', targetProfile: 'research' }

beforeEach(() => {
  _resetSessionOwnerHintsForTests()
  $connection.set({ mode: 'local' } as NonNullable<ReturnType<typeof $connection.get>>)
  $activeGatewayProfile.set('default')
})

afterEach(() => {
  _resetSessionOwnerHintsForTests()
  $connection.set(originalConnection)
  $activeGatewayProfile.set(originalProfile)
})

it('uses a single recorded owner after creation even while the window still describes the previous connection', () => {
  setSessionOwnerHint(session, recorded)
  expect(captureDraftCustodyOwner(session)).toEqual({ connectionId: recorded.connectionId, profile: 'research' })
})

it('uses the exact matching owner for same-ID conversations instead of another recorded owner', () => {
  setSessionOwnerHint(session, recorded)
  setSessionOwnerHint(session, local)
  expect(captureDraftCustodyOwner(session)).toEqual(local)
})

it('does not invent an ambient owner when multiple recorded owners are unresolved', () => {
  setSessionOwnerHint(session, recorded)
  setSessionOwnerHint(session, { connectionId: 'another-connection', profile: 'work' })
  expect(captureDraftCustodyOwner(session)).toBeUndefined()
})

it('keeps an explicit tile owner authoritative even when recorded hints are ambiguous', () => {
  setSessionOwnerHint(session, recorded)
  setSessionOwnerHint(session, local)
  expect(captureDraftCustodyOwner(session, recorded)).toEqual({ connectionId: recorded.connectionId, profile: 'research' })
})
