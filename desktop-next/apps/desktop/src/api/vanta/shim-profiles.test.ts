import { describe, expect, it, vi } from 'vitest'

import { vantaRestShim } from './rest-shim'

const views = {
  profiles: [
    { home: '/v', id: 'default', isDefault: false, model: null, name: 'default', provider: null, skillCount: 2 },
    { home: '/v/profiles/research', id: 'research', isDefault: true, model: 'm', name: 'Research', provider: 'p', skillCount: 0 }
  ]
}

const makeSend = (reply: unknown = { ok: true, id: 'research', path: '/v/profiles/research' }) =>
  vi.fn(async (request: { body?: unknown; path: string }) => (request.path === '/api/profiles' ? views : reply))

describe('profile shim', () => {
  it('maps the Vanta list to Hermes profile rows with the sticky default flagged', async () => {
    const result = (await vantaRestShim({ path: '/api/profiles' }, makeSend())) as {
      profiles: Array<{ display_name?: string; is_default: boolean; name: string; skill_count: number }>
    }

    expect(result.profiles.map(row => [row.name, row.is_default])).toEqual([
      ['default', false],
      ['research', true]
    ])
    expect(result.profiles[1]?.display_name).toBe('Research')
    expect(result.profiles[0]?.skill_count).toBe(2)
  })

  it('creates a fresh profile, or a clone when clone_from names a non-default profile', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { name: 'a' }, method: 'POST', path: '/api/profiles' }, send)
    await vantaRestShim({ body: { clone_from: 'research', name: 'b' }, method: 'POST', path: '/api/profiles' }, send)
    await vantaRestShim({ body: { clone_from: 'default', name: 'c' }, method: 'POST', path: '/api/profiles' }, send)

    expect(send.mock.calls.map(([call]) => [call.path, call.body])).toEqual([
      ['/api/profiles/create', { name: 'a' }],
      ['/api/profiles/clone', { name: 'b', source: 'research' }],
      ['/api/profiles/create', { name: 'c' }]
    ])
  })

  it('renames, deletes and reads or writes the soul by profile name', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { new_name: 'Lab' }, method: 'PATCH', path: '/api/profiles/research' }, send)
    await vantaRestShim({ method: 'DELETE', path: '/api/profiles/research' }, send)
    await vantaRestShim({ path: '/api/profiles/my%20bot/soul' }, send)
    await vantaRestShim({ body: { content: 'hi' }, method: 'PUT', path: '/api/profiles/research/soul' }, send)

    expect(send.mock.calls.map(([call]) => [call.path, call.body])).toEqual([
      ['/api/profiles/rename', { name: 'research', newName: 'Lab' }],
      ['/api/profiles/delete', { name: 'research' }],
      ['/api/profiles/soul?name=my%20bot', undefined],
      ['/api/profiles/soul', { content: 'hi', name: 'research' }]
    ])
  })

  it('exports to the archive path and imports from one', async () => {
    const exported = await vantaRestShim(
      { body: {}, method: 'POST', path: '/api/profiles/research/export' },
      makeSend({ ok: true, path: '/v/exports/research' })
    )

    expect(exported).toEqual({ archive: '/v/exports/research', ok: true })

    const send = makeSend()
    const imported = await vantaRestShim({ body: { archive: '/v/exports/research' }, method: 'POST', path: '/api/profiles/import' }, send)

    expect(send).toHaveBeenCalledWith({ body: { source: '/v/exports/research' }, method: 'POST', path: '/api/profiles/import' })
    expect(imported).toMatchObject({ desktop: null, name: 'research', ok: true })
  })

  it('lets the sessions endpoints under /api/profiles keep their own handling', async () => {
    const send = vi.fn(async (request: { path: string }) => (request.path === '/api/sessions' ? [] : { root: '/w' }))
    const page = (await vantaRestShim({ path: '/api/profiles/sessions' }, send)) as { sessions: unknown[] }

    expect(page.sessions).toEqual([])
  })
})
