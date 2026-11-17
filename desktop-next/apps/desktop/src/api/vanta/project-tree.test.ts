import { describe, expect, it } from 'vitest'

import { sessionRow } from './shim-session-row'
import { buildProjectTree, NO_PROJECT_ID } from './project-tree'

const acme = { id: 'p_acme00000001', name: 'Acme', path: '/work/acme' }
const lab = { id: 'p_lab000000001', name: 'Lab', path: '/work/lab' }

const row = (id: string, cwd: null | string, last_active = 1) => sessionRow({ cwd, id, last_active, title: id })

describe('buildProjectTree', () => {
  it('files a session under the project whose folder holds its folder, deepest folder winning', () => {
    const nested = { id: 'p_inner0000001', name: 'Inner', path: '/work/acme/inner' }

    const tree = buildProjectTree(
      [acme, nested],
      [row('a', '/work/acme'), row('b', '/work/acme/src'), row('c', '/work/acme/inner/x')]
    )

    expect(tree.find(p => p.id === acme.id)?.sessionIds.sort()).toEqual(['a', 'b'])
    expect(tree.find(p => p.id === nested.id)?.sessionIds).toEqual(['c'])
  })

  it('does not treat a sibling folder with a shared prefix as inside', () => {
    const tree = buildProjectTree([acme], [row('a', '/work/acme-old')])

    expect(tree.find(p => p.id === acme.id)?.sessionCount).toBe(0)
    expect(tree.find(p => p.isAuto)?.path).toBe('/work/acme-old')
  })

  it('gives a folder no project covers an automatic project, and a session with no folder Home', () => {
    const tree = buildProjectTree([acme], [row('s', '/tmp/scratch'), row('n', null)])
    const auto = tree.find(p => p.id === '/tmp/scratch')
    const home = tree.find(p => p.id === NO_PROJECT_ID)

    expect(auto).toMatchObject({ isAuto: true, label: 'scratch', sessionCount: 1 })
    expect(home).toMatchObject({ isAuto: true, isNoProject: true, label: 'Home', sessionIds: ['n'] })
  })

  it('keeps a named project with no sessions, and hides a derived or automatic one', () => {
    const tree = buildProjectTree([acme, { derived: true, id: '/srv/app', name: 'app', path: '/srv/app' }], [])

    expect(tree.map(p => p.id)).toEqual([acme.id])
  })

  it('lists archived sessions nowhere, orders lanes by folder, and previews the newest', () => {
    const tree = buildProjectTree(
      [lab],
      [
        row('old', '/work/lab', 1),
        row('new', '/work/lab', 9),
        row('deep', '/work/lab/pkg', 5),
        sessionRow({ archived: true, cwd: '/work/lab', id: 'gone', last_active: 99 })
      ],
      2
    )

    const node = tree[0]!

    expect(node.sessionCount).toBe(3)
    expect(node.previewSessions.map(s => s.id)).toEqual(['new', 'deep'])
    expect(node.lastActive).toBe(9)
    expect(node.repos[0]?.groups.map(g => [g.label, g.isHome ?? false])).toEqual([
      ['lab', true],
      ['pkg', false]
    ])
    expect(node.repos[0]?.groups[0]?.sessions.map(s => s.id)).toEqual(['new', 'old'])
  })
})
