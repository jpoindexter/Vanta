import { afterEach, expect, it, vi } from 'vitest'

import * as preview from './preview'
import { normalizeProfileKey } from './profile'
import { stampSecondaryProfileOwner } from './session-event-provenance'
import { createSessionRuntimeOwnership } from './session-runtime-ownership'
import {
  clearAllSessionStates,
  dropSessionState,
  knownOwnerForSession,
  recordSessionEventScope,
  runtimeSessionOwner,
  sessionEventScopeFor
} from './session-states'

afterEach(() => {
  clearAllSessionStates()
  vi.restoreAllMocks()
})

it('records exact source routes with default normalization and keeps equal profile names separate', () => {
  const ledger = createSessionRuntimeOwnership(normalizeProfileKey)
  ledger.record({ connectionId: 'one', profile: ' ', session_id: 'first' })
  ledger.record({
    connectionId: 'two',
    profile: 'default',
    session_id: 'second'
  })

  expect(ledger.ownerForRawId('first')).toEqual({
    connectionId: 'one',
    profile: 'default'
  })
  expect(ledger.scopeForRawId('first')).toBe('conn:one::default')
  expect(ledger.ownerForRawId('second')).toEqual({
    connectionId: 'two',
    profile: 'default'
  })
  expect(ledger.scopeForRawId('second')).toBe('conn:two::default')
})

it('accepts the original non-enumerable secondary proof but rejects a spread copy or plain profile', () => {
  const ledger = createSessionRuntimeOwnership(normalizeProfileKey)
  const original = stampSecondaryProfileOwner({ session_id: 'original', type: 'status.update' }, ' research ')
  ledger.record(original)
  ledger.record({ ...original, session_id: 'copy' })
  ledger.record({ profile: 'research', session_id: 'plain' })

  expect(ledger.ownerForRawId('original')).toBe('research')
  expect(ledger.scopeForRawId('original')).toBe('research')
  expect(ledger.ownerForRawId('copy')).toBeUndefined()
  expect(ledger.scopeForRawId('copy')).toBeUndefined()
  expect(ledger.ownerForRawId('plain')).toBeUndefined()
})

it('retires only profile-pool provenance and preserves the same-named exact remote route', () => {
  const ledger = createSessionRuntimeOwnership(normalizeProfileKey)
  ledger.record(stampSecondaryProfileOwner({ session_id: 'local', type: 'status.update' }, 'research'))
  ledger.record({
    connectionId: 'remote',
    profile: 'research',
    session_id: 'remote'
  })
  ledger.forgetProfileOnly(' research ')

  expect(ledger.ownerForRawId('local')).toBeUndefined()
  expect(ledger.scopeForRawId('local')).toBeUndefined()
  expect(ledger.ownerForRawId('remote')).toEqual({
    connectionId: 'remote',
    profile: 'research'
  })
  expect(ledger.scopeForRawId('remote')).toBe('conn:remote::research')
})

it('drops both ownership twins without clearing another runtime, then clears all remaining provenance', () => {
  const ledger = createSessionRuntimeOwnership(normalizeProfileKey)
  ledger.record({ connectionId: 'one', session_id: 'drop' })
  ledger.record({ connectionId: 'two', session_id: 'keep' })
  ledger.drop('drop')
  expect(ledger.ownerForRawId('drop')).toBeUndefined()
  expect(ledger.scopeForRawId('drop')).toBeUndefined()
  expect(ledger.ownerForRawId('keep')).toEqual({
    connectionId: 'two',
    profile: 'default'
  })
  ledger.clear()
  expect(ledger.ownerForRawId('keep')).toBeUndefined()
  expect(ledger.scopeForRawId('keep')).toBeUndefined()
})

it('preserves raw identity, ignores missing IDs, and does not erase an existing owner for unproven events', () => {
  const ledger = createSessionRuntimeOwnership(normalizeProfileKey)
  ledger.record({ connectionId: 'source', session_id: ' padded ' })
  ledger.record({ connectionId: 'ignored' })
  ledger.record({ profile: 'unproven', session_id: ' padded ' })

  expect(ledger.ownerForRawId(' padded ')).toEqual({
    connectionId: 'source',
    profile: 'default'
  })
  expect(ledger.scopeForRawId(' padded ')).toBe('conn:source::default')
  expect(ledger.ownerForRawId('padded')).toBeUndefined()
  expect(ledger.scopeForRawId('')).toBeUndefined()
})

it('keeps independent facade instances isolated', () => {
  const first = createSessionRuntimeOwnership(normalizeProfileKey)
  const second = createSessionRuntimeOwnership(normalizeProfileKey)
  first.record({ connectionId: 'source', session_id: 'same' })

  expect(second.ownerForRawId('same')).toBeUndefined()
  second.clear()
  expect(first.ownerForRawId('same')).toEqual({
    connectionId: 'source',
    profile: 'default'
  })
})

it('keeps public ID trimming separate from raw durable-owner fallback and drops orphan provenance', () => {
  recordSessionEventScope({ connectionId: 'source', session_id: ' padded ' })
  expect(runtimeSessionOwner(' padded ')).toBeUndefined()
  expect(sessionEventScopeFor(' padded ')).toBeUndefined()
  expect(knownOwnerForSession(' padded ')).toEqual({
    connectionId: 'source',
    profile: 'default'
  })
  dropSessionState(' padded ')
  expect(knownOwnerForSession(' padded ')).toBeUndefined()
  recordSessionEventScope({ connectionId: 'source', session_id: 'plain' })
  expect(runtimeSessionOwner(' plain ')).toEqual({
    connectionId: 'source',
    profile: 'default'
  })
})

it('synchronously re-homes the preview once for every nonempty event ID, even an unproven profile', () => {
  const rehome = vi.spyOn(preview, 'setPreviewScope')
  recordSessionEventScope({})
  expect(rehome).not.toHaveBeenCalled()
  recordSessionEventScope({ profile: 'unproven', session_id: 'untagged' })
  expect(rehome).toHaveBeenCalledTimes(1)
  expect(runtimeSessionOwner('untagged')).toBeUndefined()
  recordSessionEventScope(stampSecondaryProfileOwner({ session_id: 'proven', type: 'status.update' }, 'research'))
  expect(rehome).toHaveBeenCalledTimes(2)
  expect(runtimeSessionOwner('proven')).toBe('research')
})
