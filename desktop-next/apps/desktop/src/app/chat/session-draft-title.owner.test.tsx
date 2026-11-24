import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { NEW_SESSION_TITLE } from '@/lib/chat-runtime'
import { reloadPersistedDrafts, stashSessionDraft } from '@/store/composer'
import { DRAFT_TEXT_STORAGE_KEY } from '@/store/draft-text-storage'
import { $activeGatewayProfile } from '@/store/profile'
import { $connection } from '@/store/session'

import { SessionDraftTitle } from './session-draft-title'

const session = 'same-session-id'
const A = { connectionId: 'local', profile: 'profile-a' }
const B = { connectionId: 'local', profile: 'profile-b' }
const initialConnection = $connection.get(), initialProfile = $activeGatewayProfile.get()

afterEach(() => {
  cleanup()
  $connection.set(initialConnection)
  $activeGatewayProfile.set(initialProfile)
  localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY)
  reloadPersistedDrafts()
})

it('renders each tile title from its explicit owner, not the active profile or legacy text', () => {
  stashSessionDraft(session, 'Private legacy words', [])
  stashSessionDraft(session, 'Private A words', [], A)
  stashSessionDraft(session, 'Private B words', [], B)
  const mounted = render(<SessionDraftTitle scope={session} ownerRoute={A} />)
  expect(mounted.container.textContent).toBe('Private A words')
  mounted.rerender(<SessionDraftTitle scope={session} ownerRoute={B} />)
  expect(mounted.container.textContent).toBe('Private B words')
  act(() => { stashSessionDraft(session, 'New A words', [], A) })
  expect(mounted.container.textContent).toBe('Private B words')
})

it('updates an ambient title when owner readiness changes without another draft write', () => {
  $connection.set(null)
  stashSessionDraft(session, 'Private legacy words', [])
  stashSessionDraft(session, 'Private A words', [], A)
  $activeGatewayProfile.set(A.profile)
  const mounted = render(<SessionDraftTitle scope={session} />)
  expect(mounted.container.textContent).toBe(NEW_SESSION_TITLE)
  act(() => { $connection.set({ mode: 'local' } as NonNullable<ReturnType<typeof $connection.get>>) })
  expect(mounted.container.textContent).toBe('Private A words')
})

it('uses the backend target profile when a tile has a desktop alias', () => {
  stashSessionDraft(session, 'Backend profile words', [], A)
  const mounted = render(<SessionDraftTitle scope={session} ownerRoute={{ ...A, profile: 'desktop-alias', targetProfile: A.profile }} />)
  expect(mounted.container.textContent).toBe('Backend profile words')
})
