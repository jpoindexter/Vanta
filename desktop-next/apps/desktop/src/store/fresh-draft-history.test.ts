import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDraftWindowScope, rememberedFreshDraft, rememberFreshDraft } from './fresh-draft-history'

const writer = { connectionId: 'local', profile: 'writer' }
const sticky = { connectionId: 'local', profile: 'sticky' }
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, '', '/') })
afterEach(() => window.history.replaceState(null, '', '/'))

it('retains exact independent owner handles and never chooses a draft by recency or text', () => {
  rememberFreshDraft(writer, '__new__:writer-handle')
  rememberFreshDraft(sticky, '__new__:sticky-handle')
  rememberFreshDraft({ ...writer, connectionId: 'another-device' }, '__new__:remote-handle')
  expect(rememberedFreshDraft(writer)).toBe('__new__:writer-handle')
  expect(rememberedFreshDraft(sticky)).toBe('__new__:sticky-handle')
  expect(rememberedFreshDraft({ ...writer, connectionId: 'another-device' })).toBe('__new__:remote-handle')
})

it('keeps peer windows separate from main and from each other, including reload', () => {
  rememberFreshDraft(writer, '__new__:main')
  window.history.replaceState(null, '', '/?peer=1')
  const peer = freshDraftWindowScope()
  expect(rememberedFreshDraft(writer)).toBeUndefined()
  rememberFreshDraft(writer, '__new__:peer')
  expect(freshDraftWindowScope()).toBe(peer)
  window.sessionStorage.clear() // A separately constructed native peer has its own storage namespace.
  expect(freshDraftWindowScope()).not.toBe(peer)
  expect(rememberedFreshDraft(writer)).toBeUndefined()
  window.history.replaceState(null, '', '/')
  expect(rememberedFreshDraft(writer)).toBe('__new__:main')
})

it('restores the formerly active handle on cold module load, but deliberate New chat gets a different handle', async () => {
  rememberFreshDraft(writer, '__new__:exact-unsent')
  vi.resetModules()
  const scopes = await import('./fresh-draft-scope')
  expect(scopes.initializeFreshDraftOwner(writer)).toBe('__new__:exact-unsent')
  const next = scopes.rotateFreshDraftKey(writer)
  expect(next).not.toBe('__new__:exact-unsent')
  expect(scopes.initializeFreshDraftOwner(writer)).toBe(next)
  vi.resetModules()
  expect((await import('./fresh-draft-scope')).initializeFreshDraftOwner(writer)).toBe(next)
})

it('does not repair corrupt index bytes or alter unrelated draft content', () => {
  const key = 'vanta.desktop.freshDraftHistory:v1:main'
  window.localStorage.setItem(key, '{broken')
  window.localStorage.setItem('desktop:composer-drafts:v4', 'retained words')
  rememberFreshDraft(writer, '__new__:replacement')
  expect(rememberedFreshDraft(writer)).toBeUndefined()
  expect(window.localStorage.getItem(key)).toBe('{broken')
  expect(window.localStorage.getItem('desktop:composer-drafts:v4')).toBe('retained words')
})
