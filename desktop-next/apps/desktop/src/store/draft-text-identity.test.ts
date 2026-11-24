import { afterEach, expect, it } from 'vitest'
import { adoptGoneSessionDraft, adoptNewSessionDraft, announceGoneSessionDraft, announceNewSessionDraftKey, clearSessionDraft, consumeSessionDraftText, currentDraftTextRevision, draftTitleFor, migrateSessionDraft, quoteSessionDraftText, reloadPersistedDrafts, stashSessionDraft, takeSessionDraft, undoRestoredDraft } from './composer'
import { draftTextIdentity, ownedDraftTextScope } from './draft-text-identity'
import { DRAFT_TEXT_STORAGE_KEY } from './draft-text-storage'

const A = { connectionId: 'local', profile: 'A' }, B = { connectionId: 'local', profile: 'B' }
const remote = { connectionId: 'another-host', profile: 'A' }, session = 'same-stored-id'
afterEach(() => { localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY); reloadPersistedDrafts() })

it('keeps same-ID text, titles and revisions separate by captured profile and connection across reload', () => {
  stashSessionDraft(session, 'A private draft', [], A)
  stashSessionDraft(session, 'B private draft', [], B)
  stashSessionDraft(session, 'Another host draft', [], remote)
  const aRevision = currentDraftTextRevision(session, A)
  reloadPersistedDrafts()
  expect(takeSessionDraft(session, A).text).toBe('A private draft')
  expect(takeSessionDraft(session, B).text).toBe('B private draft')
  expect(takeSessionDraft(session, remote).text).toBe('Another host draft')
  expect(draftTitleFor(session, A)).not.toBe(draftTitleFor(session, B))
  expect(currentDraftTextRevision(session, A)).toBe(aRevision)
  expect(currentDraftTextRevision(session, B)).not.toBe(aRevision)
  clearSessionDraft(session, B)
  expect(takeSessionDraft(session, A).text).toBe('A private draft')
})

it('does not silently adopt unowned legacy words into any current owner', () => {
  stashSessionDraft(session, 'Ambiguous legacy words', [])
  expect(takeSessionDraft(session, A).text).toBe('')
  expect(takeSessionDraft(session, B).text).toBe('')
  expect(takeSessionDraft(session).text).toBe('Ambiguous legacy words')
})

it('binds consumption to the captured owner and refuses cross-owner migration', () => {
  stashSessionDraft(session, 'Same words', [], A)
  stashSessionDraft(session, 'Same words', [], B)
  const quote = quoteSessionDraftText(session, A)!
  expect(quote.scope).toBe(ownedDraftTextScope(A, session))
  expect(consumeSessionDraftText(quote)).toBe(true)
  expect(takeSessionDraft(session, B).text).toBe('Same words')
  expect(migrateSessionDraft(ownedDraftTextScope(B, session), ownedDraftTextScope(A, 'different'))).toBe(false)
  expect(takeSessionDraft(session, B).text).toBe('Same words')
})

it('keeps concurrent first-create announcements and positive rekeys bound to each owner', () => {
  stashSessionDraft('__new__:A', 'First A', [], A)
  stashSessionDraft('__new__:B', 'First B', [], B)
  announceNewSessionDraftKey(session, '__new__:A', A)
  announceNewSessionDraftKey(session, '__new__:B', B)
  expect(adoptNewSessionDraft(session, B)).toBe(true)
  expect(adoptNewSessionDraft(session, A)).toBe(true)
  expect(takeSessionDraft(session, A).text).toBe('First A')
  expect(takeSessionDraft(session, B).text).toBe('First B')
  expect(migrateSessionDraft(session, 'lineage-root', A)).toBe(true)
  expect(takeSessionDraft('lineage-root', A).text).toBe('First A')
  expect(takeSessionDraft(session, B).text).toBe('First B')
})

it('binds GONE recovery and Undo to the original owner without changing another owner’s draft', () => {
  stashSessionDraft(session, 'Recover A', [], A)
  stashSessionDraft(null, 'Keep B', [], B)
  announceGoneSessionDraft(session, A)
  expect(adoptGoneSessionDraft(B)).toBe(false)
  expect(adoptGoneSessionDraft(A)).toBe(true)
  expect(takeSessionDraft(null, A).text).toBe('Recover A')
  expect(undoRestoredDraft('Recover A', B)).toBe(false)
  expect(undoRestoredDraft('Recover A', A)).toBe(true)
  expect(takeSessionDraft(session, A).text).toBe('Recover A')
  expect(takeSessionDraft(null, B).text).toBe('Keep B')
})

it.each(['{}', '[]', '["local","A","session","extra"]', '["local",null,"session"]'])('rejects malformed owned identities: %s', raw => {
  expect(() => draftTextIdentity('__owned_draft_text_v1__:' + raw)).toThrow()
})
