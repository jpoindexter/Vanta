import { describe, expect, it, vi } from 'vitest'

import { vantaRestShim } from './rest-shim'

const metas = [
  {
    id: 'a',
    started: '2026-10-13T10:00:00Z',
    title: 'Older',
    turns: 1,
    updated: '2026-10-13T10:05:00Z'
  },
  {
    id: 'b',
    pinned: true,
    started: '2026-10-13T11:00:00Z',
    title: 'Newer',
    turns: 2,
    updated: '2026-10-13T11:30:00Z'
  },
  {
    archived: true,
    id: 'c',
    started: '2026-10-12T09:00:00Z',
    title: 'Gone',
    turns: 1
  }
]

const makeSend = () =>
  vi.fn(async (request: { path: string }) => (request.path === '/api/status' ? { root: '/work/acme' } : metas))

describe('vantaRestShim', () => {
  it('lists sessions newest first, hiding archived ones, with the project root as cwd', async () => {
    const send = makeSend()
    const page = (await vantaRestShim({ path: '/api/profiles/sessions?limit=10&archived=exclude' }, send)) as {
      sessions: Array<{ cwd: string; id: string; pinned: boolean }>
      total: number
    }

    expect(page.sessions.map(row => row.id)).toEqual(['b', 'a'])
    expect(page.sessions[0]).toMatchObject({ cwd: '/work/acme', pinned: true })
    expect(page.total).toBe(2)
  })

  it('serves only archived rows when asked for them', async () => {
    const page = (await vantaRestShim({ path: '/api/profiles/sessions?archived=only' }, makeSend())) as {
      sessions: Array<{ id: string }>
    }

    expect(page.sessions.map(row => row.id)).toEqual(['c'])
  })

  it('fills the batched sidebar slices with recents only', async () => {
    const result = (await vantaRestShim({ path: '/api/profiles/sessions/sidebar?recents_limit=1' }, makeSend())) as {
      cron: { sessions: unknown[] }
      messaging: { sessions: unknown[] }
      recents: { sessions: Array<{ id: string }> }
    }

    expect(result.recents.sessions.map(row => row.id)).toEqual(['b'])
    expect(result.cron.sessions).toEqual([])
    expect(result.messaging.sessions).toEqual([])
  })

  it('offers the one default profile', async () => {
    const result = (await vantaRestShim({ path: '/api/profiles' }, makeSend())) as { profiles: Array<{ name: string }> }

    expect(result.profiles.map(profile => profile.name)).toEqual(['default'])
  })

  it('maps a PATCH pin to the Vanta pin route', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { pinned: true }, method: 'PATCH', path: '/api/sessions/a' }, send)

    expect(send).toHaveBeenCalledWith({
      body: { id: 'a', pinned: true },
      method: 'POST',
      path: '/api/sessions/pin'
    })
  })

  it('lets every other call through', () => {
    expect(vantaRestShim({ path: '/api/status' }, makeSend())).toBeNull()
    expect(vantaRestShim({ method: 'POST', path: '/api/sessions/new' }, makeSend())).toBeNull()
  })
})
