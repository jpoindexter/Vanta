import { afterEach, beforeEach, expect, it } from 'vitest'

import { captureDraftCustodyOwner } from './draft-custody-owner'
import { $activeGatewayProfile, $newChatProfile, $newChatRoute, captureNewChatSource } from './profile'
import { $connection, _resetSessionOwnerHintsForTests, setSessionOwnerHint } from './session'

const originalConnection = $connection.get(), originalProfile = $activeGatewayProfile.get()
const session = 'same-stored-id'
const local = { connectionId: 'local', profile: 'default' }
const recorded = { connectionId: 'connection-created-chat', profile: 'work', targetProfile: 'research' }

beforeEach(() => {
  _resetSessionOwnerHintsForTests()
  $connection.set({ mode: 'local' } as NonNullable<ReturnType<typeof $connection.get>>)
  $activeGatewayProfile.set('default')
  $newChatProfile.set(null)
  $newChatRoute.set(null)
  captureNewChatSource(null)
})

afterEach(() => {
  _resetSessionOwnerHintsForTests()
  $connection.set(originalConnection)
  $activeGatewayProfile.set(originalProfile)
  $newChatProfile.set(null)
  $newChatRoute.set(null)
  captureNewChatSource(null)
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

it.each([null, '__new__:pending-profile'])('pins fresh draft %s to the selected legacy profile before its gateway activates', fresh => {
  $newChatProfile.set('sticky')
  expect(captureDraftCustodyOwner(fresh)).toEqual({ connectionId: 'local', profile: 'sticky' })
  $activeGatewayProfile.set('sticky')
  expect(captureDraftCustodyOwner(fresh)).toEqual({ connectionId: 'local', profile: 'sticky' })
})

it('does not let a fresh-chat profile pick reassign a stored chat or an explicitly scoped composer', () => {
  $newChatProfile.set('sticky')
  expect(captureDraftCustodyOwner(session)).toEqual(local)
  expect(captureDraftCustodyOwner(null, recorded)).toEqual({ connectionId: recorded.connectionId, profile: 'research' })
})
