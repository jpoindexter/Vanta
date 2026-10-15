import { describe, expect, it } from 'vitest'

import { buildHermesDesktop } from './bridge-surface'
import { env, fakeIpc } from './bridge-test-helpers'
import { CH } from './channels'

const PROFILES = {
  data: { profiles: [{ isDefault: true, name: 'default' }, { isDefault: false, name: 'research' }] },
  ok: true,
  status: 200
}

describe('profiles and the agent roster', () => {
  it('lists the server profiles as bots on the one local connection', async () => {
    const { invoked, ipc } = fakeIpc(PROFILES)
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const roster = await desktop.getAgentRoster()

    expect(roster.agents.map((agent: { handle: string }) => agent.handle)).toEqual(['default', 'research'])
    expect(roster.sources).toEqual([expect.objectContaining({ connectionId: 'local', reachable: true })])
    expect(invoked[0]).toEqual([CH.request, { method: 'GET', path: '/api/profiles' }])
  })

  it('shows an empty roster when the server cannot list profiles', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc({ data: { error: 'down' }, ok: false, status: 500 }).ipc)) as Record<string, any>

    await expect(desktop.getAgentRoster()).resolves.toMatchObject({ agents: [] })
  })

  it('reads the default profile from the one the server marks default', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc(PROFILES).ipc)) as Record<string, any>

    await expect(desktop.profile.getDefault()).resolves.toEqual({ connectionId: null, profile: 'default' })
  })

  it('sets the default through POST /api/profiles/set-default and tells listeners', async () => {
    const { invoked, ipc } = fakeIpc({ data: { name: 'research' }, ok: true, status: 200 })
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const seen: unknown[] = []

    desktop.profile.onDefaultChanged((route: unknown) => seen.push(route))

    await expect(desktop.profile.setDefault({ connectionId: null, profile: 'research' })).resolves.toEqual({
      connectionId: null,
      profile: 'research'
    })
    expect(invoked[0]).toEqual([CH.request, { body: { name: 'research' }, method: 'POST', path: '/api/profiles/set-default' }])
    expect(seen).toEqual([{ connectionId: null, profile: 'research' }])
  })

  it('reports the server refusal instead of pretending the default changed', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc({ data: { error: 'no such profile' }, ok: false, status: 404 }).ipc)) as Record<string, any>

    await expect(desktop.profile.setDefault({ connectionId: null, profile: 'ghost' })).rejects.toThrow('no such profile')
  })
})
