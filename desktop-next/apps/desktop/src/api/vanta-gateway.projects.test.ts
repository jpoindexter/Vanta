import { describe, expect, it } from 'vitest'

import { connectedHarness, healthyTransport } from './vanta/gateway-fixture'

const entry = { createdAt: '2026-10-13T09:00:00Z', derived: false, id: 'p_abc123456789', name: 'Acme Corp', path: '/work/acme' }

describe('projects.* RPC', () => {
  it('lists named projects with the active pointer and leaves out the folder-derived one', async () => {
    const transport = healthyTransport().ok('GET /api/projects', {
      activeId: 'p_abc123456789',
      projects: [entry, { ...entry, derived: true, id: '/work/other', name: 'other', path: '/work/other' }]
    })

    const harness = await connectedHarness(transport)
    const result = await harness.gateway.request<{ active_id: string; projects: Array<Record<string, unknown>> }>('projects.list', { profile: 'default' })

    expect(result.active_id).toBe('p_abc123456789')
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0]).toMatchObject({ id: 'p_abc123456789', name: 'Acme Corp', primary_path: '/work/acme', slug: 'acme-corp' })
  })

  it('creates a project from the primary path and makes it active when asked', async () => {
    const transport = healthyTransport()
      .ok('POST /api/projects/create', { ok: true, project: entry })
      .ok('POST /api/projects/set-active', { activeId: entry.id, ok: true })

    const harness = await connectedHarness(transport)

    const result = await harness.gateway.request<{ project: { id: string } }>('projects.create', {
      folders: [{ path: '/ignored' }],
      name: 'Acme Corp',
      primary_path: '/work/acme',
      use: true
    })

    expect(transport.callsTo('POST /api/projects/create')[0]?.body).toEqual({ name: 'Acme Corp', path: '/work/acme' })
    expect(transport.callsTo('POST /api/projects/set-active')[0]?.body).toEqual({ id: entry.id })
    expect(result.project.id).toBe(entry.id)
  })

  it('renames, deletes and activates through their routes', async () => {
    const transport = healthyTransport()
      .ok('POST /api/projects/rename', { ok: true })
      .ok('POST /api/projects/delete', { activeId: null, ok: true })
      .ok('GET /api/projects', { activeId: null, projects: [] })
      .ok('POST /api/projects/set-active', { activeId: 'p_abc123456789', ok: true })

    const harness = await connectedHarness(transport)

    await harness.gateway.request('projects.update', { color: 'red', id: 'p_abc123456789', name: 'Renamed' })
    expect(transport.callsTo('POST /api/projects/rename')[0]?.body).toEqual({ id: 'p_abc123456789', name: 'Renamed' })

    expect(await harness.gateway.request('projects.delete', { id: 'p_abc123456789' })).toEqual({ active_id: null, projects: [] })
    expect(await harness.gateway.request('projects.set_active', { id: 'p_abc123456789' })).toEqual({ active_id: 'p_abc123456789' })
  })

  it('surfaces a duplicate-name error from the server', async () => {
    const transport = healthyTransport().ok('POST /api/projects/create', { error: 'a project named "Acme" already exists' }, 409)
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('projects.create', { name: 'Acme' })).rejects.toThrow('already exists')
  })
})
