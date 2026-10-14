import { describe, expect, it } from 'vitest'

import { connectedHarness, healthyTransport } from './vanta/gateway-fixture'

const projects = {
  activeId: 'p_acme00000001',
  projects: [
    { createdAt: '2026-10-13T09:00:00Z', derived: false, id: 'p_acme00000001', name: 'Acme', path: '/work/acme' },
    { createdAt: '', derived: true, id: '/work/project', name: 'project', path: '/work/project' }
  ]
}

const sessions = [
  { cwd: '/work/acme', id: 's1', started: '2026-10-13T10:00:00Z', title: 'In Acme', turns: 1, updated: '2026-10-13T10:05:00Z' },
  { cwd: '/work/project/api', id: 's2', started: '2026-10-13T11:00:00Z', title: 'In the folder', turns: 2, updated: '2026-10-13T11:30:00Z' },
  { id: 's3', started: '2026-10-12T09:00:00Z', title: 'Before folders were kept', turns: 1 },
  { archived: true, cwd: '/work/acme', id: 's4', started: '2026-10-12T09:00:00Z', title: 'Archived', turns: 1 },
  { cwd: '/work/acme', id: 's5', started: '2026-10-12T09:00:00Z', title: 'Trashed', trashed: true, turns: 1 }
]

const transport = () => healthyTransport().ok('GET /api/projects', projects).ok('GET /api/sessions', sessions)

describe('projects.tree and projects.project_sessions RPC', () => {
  it('serves project lanes from the project list and each session folder', async () => {
    const harness = await connectedHarness(transport())

    const tree = await harness.gateway.request<{
      active_id: string
      projects: Array<{ id: string; isAuto?: boolean; isNoProject?: boolean; sessionIds: string[] }>
      scoped_session_ids: string[]
    }>('projects.tree', { preview_limit: 3 })

    expect(tree.active_id).toBe('p_acme00000001')
    expect(tree.projects.map(p => [p.id, p.sessionIds])).toEqual([
      ['p_acme00000001', ['s1']],
      ['/work/project', ['s2']],
      ['__no_project__', ['s3']]
    ])
    expect(tree.projects[1]?.isAuto).toBe(true)
    expect(tree.projects[2]?.isNoProject).toBe(true)
    expect(tree.scoped_session_ids.sort()).toEqual(['s1', 's2', 's3'])
  })

  it('drills into one project, and answers null for an unknown one', async () => {
    const harness = await connectedHarness(transport())

    const found = await harness.gateway.request<{ project: { id: string; sessionCount: number } | null }>(
      'projects.project_sessions',
      { project_id: 'p_acme00000001' }
    )

    expect(found.project).toMatchObject({ id: 'p_acme00000001', sessionCount: 1 })

    expect(await harness.gateway.request('projects.project_sessions', { project_id: 'p_nope' })).toEqual({ project: null })
  })

  it('carries each session folder on session.list', async () => {
    const harness = await connectedHarness(transport())

    const listed = await harness.gateway.request<{ sessions: Array<{ cwd?: string; id: string }> }>('session.list', {})

    expect(listed.sessions.find(s => s.id === 's1')?.cwd).toBe('/work/acme')
    expect(listed.sessions.find(s => s.id === 's3')?.cwd).toBeUndefined()
  })
})

describe('profiles.list RPC', () => {
  it('maps the profile list to roster rows, the sticky default flagged', async () => {
    const harness = await connectedHarness(
      healthyTransport().ok('GET /api/profiles', {
        profiles: [
          { home: '/v', id: 'default', isDefault: false, model: null, name: 'default', provider: null, skillCount: 2 },
          { home: '/v/profiles/research', id: 'research', isDefault: true, model: 'm', name: 'Research', provider: 'p', skillCount: 0 }
        ]
      })
    )

    const result = await harness.gateway.request<{ profiles: Array<Record<string, unknown>> }>('profiles.list', {
      include_sessions: false
    })

    expect(result.profiles.map(p => [p.name, p.is_default])).toEqual([
      ['default', false],
      ['research', true]
    ])
    expect(result.profiles[1]).toMatchObject({ display_name: 'Research', model: 'm', path: '/v/profiles/research', ui_meta: {} })
  })
})
