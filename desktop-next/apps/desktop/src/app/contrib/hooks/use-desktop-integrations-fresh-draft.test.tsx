import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { $diskPluginsScanPending } from '@/contrib/runtime-loader'
import { rescopeConnectionScopedStores } from '@/lib/connection-scoped'
import {
  adoptNewSessionDraft, announceNewSessionDraftKey, clearSessionDraft, freshDraftScope,
  rotateFreshDraftKey, stashSessionDraft, takeSessionDraft, type ComposerAttachment
} from '@/store/composer'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { rememberedFreshDraft } from '@/store/fresh-draft-history'
import { $activeGatewayProfile, $newChatRoute } from '@/store/profile'
import {
  $connection, _resetLegacyDiscardForTests, _resetSessionOwnerHintsForTests,
  getRememberedRoute, getRememberedSessionId, setRememberedRoute, setRememberedSessionId
} from '@/store/session'

import { makeSessionInfo } from '../../../test/session-info'
import { sessionRoute } from '../../routes'
import { useDesktopIntegrations } from './use-desktop-integrations'

type Owner = { connectionId: string; profile: string }
type Params = Parameters<typeof useDesktopIntegrations>[0]
const local = { connectionId: 'local', profile: 'writer' }
const owners = [local, { ...local, profile: 'research' }, { ...local, connectionId: 'remote-fixture' }]
const oldSession = 'older-stored-chat'
const image: ComposerAttachment = {
  id: 'fixture-image', occurrenceId: 'fixture-occurrence', kind: 'image', label: 'unsent.png',
  imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' }
}
const original = {
  bridge: window.desktopBridge, connection: $connection.get(), profile: $activeGatewayProfile.get(),
  route: $newChatRoute.get(), pending: $diskPluginsScanPending.get()
}
const desktopWindow = window as unknown as { desktopBridge?: Window['desktopBridge'] }
const navigate = vi.fn()
const drafts: { scope: string; owner: Owner }[] = []

function selectOwner(owner: Owner) {
  const mode = owner.connectionId === 'local' ? 'local' : 'remote'
  const descriptor = { ...owner, mode, baseUrl: 'http://fixture.invalid' } as NonNullable<ReturnType<typeof $connection.get>>
  $connection.set(descriptor)
  rescopeConnectionScopedStores(descriptor)
  $activeGatewayProfile.set(owner.profile)
  $newChatRoute.set(owner)
}

function rememberDraft(owner: Owner, text = '', attachments: ComposerAttachment[] = []) {
  selectOwner(owner)
  const scope = rotateFreshDraftKey(owner)
  drafts.push({ scope, owner }, { scope: oldSession, owner })
  stashSessionDraft(scope, text, attachments, owner)
  setRememberedRoute('/', owner.profile)
  setRememberedSessionId(oldSession, owner.profile)
  return scope
}

function params(overrides: Partial<Params> = {}): Params {
  return {
    activeProfile: local.profile, chatOpen: false, hasPreview: false, locationPathname: '/', navigate,
    profileReady: true, refreshSessions: vi.fn(), resumeLastSession: true,
    resumeExhaustedSessionId: null, routedSessionId: null, runtimeIdByStoredSessionId: { current: new Map() },
    sessions: [makeSessionInfo({ id: oldSession, profile: local.profile })], ...overrides
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  _resetLegacyDiscardForTests()
  _resetSessionOwnerHintsForTests({ storage: true })
  announceNewSessionDraftKey(null)
  navigate.mockReset()
  $diskPluginsScanPending.set(false)
  selectOwner(local)
  desktopWindow.desktopBridge = {
    setPreviewShortcutActive: vi.fn(), onOpenUpdatesRequested: vi.fn(), onFocusSession: vi.fn(),
    onNotificationAction: vi.fn(), onNotificationActivate: vi.fn(), onDeepLink: vi.fn(),
    signalDeepLinkReady: vi.fn(), onClosePreviewRequested: vi.fn(), onOpenFolderRequested: vi.fn(),
    api: vi.fn(async () => { throw new Error('No backend is allowed in this restore fixture') })
  } as unknown as Window['desktopBridge']
})

afterEach(() => {
  cleanup()
  for (const { scope, owner } of drafts.splice(0)) clearSessionDraft(scope, owner)
  announceNewSessionDraftKey(null)
  desktopWindow.desktopBridge = original.bridge
  $newChatRoute.set(original.route)
  $activeGatewayProfile.set(original.profile)
  $connection.set(original.connection)
  rescopeConnectionScopedStores(original.connection ?? { mode: 'local' })
  $diskPluginsScanPending.set(original.pending)
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

it.each([
  ['text', 'cancelled unsent words', []],
  ['image-only', '', [image]],
  ['text and image', 'unsent with picture', [image]],
  ['empty', '', []]
] as const)('keeps explicitly remembered %s fresh chat across hook remount without donating it', (_label, text, images) => {
  const attachments = [...images]
  const scope = rememberDraft(local, text, attachments)
  const first = renderHook(useDesktopIntegrations, { initialProps: params() })
  first.unmount()
  renderHook(useDesktopIntegrations, { initialProps: params() })
  expect(navigate).not.toHaveBeenCalled()
  expect(adoptNewSessionDraft(oldSession, local)).toBe(false)
  expect(takeSessionDraft(oldSession, local)).toEqual({ text: '', attachments: [] })
  expect(takeSessionDraft(scope, local)).toEqual({ text, attachments })
  expect(freshDraftScope()).toBe(scope)
  expect(rememberedFreshDraft(local)).toBe(scope)
  expect(getRememberedRoute(local.profile)).toBe('/')
  expect(getRememberedSessionId(local.profile)).toBe(oldSession)
})

it.each(owners)('retains exact fresh owner $connectionId/$profile and other-owner sentinels', owner => {
  const saved = owners.map(other => ({ owner: other, scope: rememberDraft(other, other.connectionId + other.profile, [image]) }))
  selectOwner(owner)
  const scope = rotateFreshDraftKey(owner, true)
  renderHook(useDesktopIntegrations, { initialProps: params({
    activeProfile: owner.profile, sessions: [makeSessionInfo({ id: oldSession, profile: owner.profile })]
  }) })
  expect(navigate).not.toHaveBeenCalled()
  expect(captureDraftCustodyOwner(null)).toEqual(owner)
  expect(freshDraftScope()).toBe(scope)
  for (const entry of saved) {
    expect(rememberedFreshDraft(entry.owner)).toBe(entry.scope)
    expect(takeSessionDraft(entry.scope, entry.owner)).toEqual({ text: entry.owner.connectionId + entry.owner.profile, attachments: [image] })
    expect(adoptNewSessionDraft(oldSession, entry.owner)).toBe(false)
  }
})

it('waits for readiness/config, then keeps fresh intent through session and plugin arrival', () => {
  rememberDraft(local, 'still unsent', [image])
  const hook = renderHook(useDesktopIntegrations, { initialProps: params({ profileReady: false, resumeLastSession: undefined, sessions: [] }) })
  expect(navigate).not.toHaveBeenCalled()
  hook.rerender(params({ resumeLastSession: undefined, sessions: [] }))
  expect(navigate).not.toHaveBeenCalled()
  $diskPluginsScanPending.set(true)
  hook.rerender(params({ sessions: [] }))
  hook.rerender(params())
  expect(navigate).not.toHaveBeenCalled()
  expect(adoptNewSessionDraft(oldSession, local)).toBe(false)
})

it('keeps a peer window fresh without touching the main window handle or route', () => {
  const mainScope = rememberDraft(local, 'main words', [image])
  setRememberedRoute(sessionRoute(oldSession), local.profile)
  window.history.replaceState(null, '', '/?peer=1')
  const peerScope = rotateFreshDraftKey(local)
  drafts.push({ scope: peerScope, owner: local })
  stashSessionDraft(peerScope, 'peer words', [image], local)
  renderHook(useDesktopIntegrations, { initialProps: params() })
  expect(navigate).not.toHaveBeenCalled()
  expect(freshDraftScope()).toBe(peerScope)
  expect(rememberedFreshDraft(local)).toBe(peerScope)
  expect(getRememberedRoute(local.profile)).toBe(sessionRoute(oldSession))
  window.history.replaceState(null, '', '/')
  expect(rememberedFreshDraft(local)).toBe(mainScope)
  expect(takeSessionDraft(mainScope, local).text).toBe('main words')
})

it('preserves resume-off and an explicit deep link ahead of remembered navigation', () => {
  rememberDraft(local, 'do not move', [image])
  setRememberedRoute(sessionRoute(oldSession), local.profile)
  const disabled = renderHook(useDesktopIntegrations, { initialProps: params({ resumeLastSession: false }) })
  expect(navigate).not.toHaveBeenCalled()
  disabled.unmount()
  renderHook(useDesktopIntegrations, { initialProps: params({ locationPathname: '/capabilities' }) })
  expect(navigate).not.toHaveBeenCalled()
  expect(adoptNewSessionDraft(oldSession, local)).toBe(false)
  expect(getRememberedRoute(local.profile)).toBe('/capabilities')
})

it('still restores a remembered stored session and adopts its boot-time draft', () => {
  rememberDraft(local, 'typed while booting', [image])
  setRememberedRoute(sessionRoute(oldSession), local.profile)
  renderHook(useDesktopIntegrations, { initialProps: params() })
  expect(navigate).toHaveBeenCalledWith(sessionRoute(oldSession), { replace: true })
  expect(adoptNewSessionDraft(oldSession, local)).toBe(true)
  expect(takeSessionDraft(oldSession, local)).toEqual({ text: 'typed while booting', attachments: [image] })
})
