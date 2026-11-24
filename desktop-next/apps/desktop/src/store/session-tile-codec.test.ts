import { afterEach, expect, it, vi } from 'vitest'

import type { SessionTile } from './session-states'
import { toStored } from './session-tile-codec'

afterEach(() => {
  window.localStorage.clear()
  vi.resetModules()
})

it('round-trips durable placement and owner identity without persisting transient runtime state', () => {
  const tile: SessionTile = {
    storedSessionId: 'stored-bot',
    dir: 'center',
    anchor: 'workspace',
    before: null,
    ownerProfile: 'writer',
    ownerRoute: { connectionId: 'remote-a', profile: 'writer', mode: 'remote', targetProfile: 'writer' },
    workspaceMode: 'bots',
    workspaceOwnerKey: 'remote-a::writer',
    workspaceTabTitle: 'Bot Chat',
    runtimeId: 'ephemeral-runtime',
    error: 'ephemeral error'
  }
  const original = structuredClone(tile)
  const before = window.localStorage.length
  const { runtimeId: _runtime, error: _error, ...durable } = tile
  expect(JSON.parse(JSON.stringify(toStored(tile)))).toEqual(durable)
  expect(toStored(tile).ownerRoute).toBe(tile.ownerRoute)
  expect(tile).toEqual(original)
  expect(window.localStorage.length).toBe(before)
})

it('retains the existing invalid-legacy normalization and scoped save path', async () => {
  vi.resetModules()
  const storage = await import('@/lib/storage')
  storage.writeJson('vanta.desktop.sessionTiles.v1', [
    null,
    {},
    { storedSessionId: 42 },
    {
      storedSessionId: 'legacy-a',
      anchor: 'session-tile:legacy-a',
      before: 42,
      dir: 'right',
      ownerProfile: '   ',
      ownerRoute: { connectionId: 'local', profile: 'default' },
      workspaceOwnerKey: 'not-a-bot',
      runtimeId: 'stale-runtime',
      error: 'stale-error'
    }
  ])
  const state = await import('./session-states')
  expect(state.$sessionTiles.get()).toHaveLength(1)
  const restored = state.$sessionTiles.get()[0]
  expect(restored).toMatchObject({ storedSessionId: 'legacy-a', ownerProfile: 'default', workspaceMode: 'sessions' })
  for (const field of ['anchor', 'before', 'runtimeId', 'error', 'workspaceOwnerKey'] as const) expect(restored[field]).toBeUndefined()
  expect(storage.readJson('vanta.desktop.sessionTiles.v1')).toBeNull()

  state.$sessionTiles.set([{ ...restored, runtimeId: 'live-runtime', error: 'live-error' }])
  state.openSessionTile('new-b', 'right', undefined, undefined, {
    ownerRoute: { connectionId: 'local', profile: 'default' },
    workspaceMode: 'sessions'
  })
  const saved = storage.readJson<Record<string, SessionTile[]>>('vanta.desktop.sessionTiles.v2')
  expect(saved?.default.map(tile => tile.storedSessionId)).toEqual(['legacy-a', 'new-b'])
  expect(saved?.default[0]).toMatchObject({
    storedSessionId: 'legacy-a', ownerProfile: 'default', ownerRoute: { connectionId: 'local', profile: 'default' }
  })
  expect(saved?.default[0]).not.toHaveProperty('runtimeId')
  expect(saved?.default[0]).not.toHaveProperty('error')
})
