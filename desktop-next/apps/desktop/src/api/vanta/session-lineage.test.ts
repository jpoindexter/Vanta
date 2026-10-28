import { describe, expect, it, vi } from 'vitest'

import { sessionList } from './handlers-session'
import type { GatewayHub } from './hub'
import { sessionMetaSchema } from './schemas'
import { sessionInfoFromMeta } from './shim-session-row'

const metadata = { id: 'child', title: 'Child', cwd: '/project', parentSessionId: 'parent', started: '2026-10-28T10:00:00Z', turns: 2 }

describe('session lineage projections', () => {
  it('keeps genuine fork ancestry in the REST/detail/project-tree row', () => {
    const row = sessionInfoFromMeta(sessionMetaSchema.parse(metadata))
    expect(row).toMatchObject({ id: 'child', parent_session_id: 'parent', _branched_from: 'parent' })
    expect(row._lineage_root_id).toBeUndefined()
  })

  it('keeps the same ancestry in the independent RPC list path', async () => {
    const get = vi.fn().mockResolvedValue({ data: [metadata], ok: true, status: 200 })
    const result = await sessionList({ caller: { get } } as unknown as GatewayHub, {})
    expect(result).toMatchObject({ sessions: [{ id: 'child', parent_session_id: 'parent', _branched_from: 'parent' }] })
    expect(get).toHaveBeenCalledWith(undefined, '/api/sessions')
  })

  it('never guesses ancestry from a legacy title', async () => {
    const legacy = { id: 'old', title: 'Parent (branch)' }
    const row = sessionInfoFromMeta(sessionMetaSchema.parse(legacy))
    expect(row.parent_session_id).toBeUndefined()
    expect(row._branched_from).toBeUndefined()
  })
})
