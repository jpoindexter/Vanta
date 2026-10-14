import { z } from 'zod'

import type { Handler } from './handlers-session'
import type { GatewayHub } from './hub'
import { buildProjectTree, type ProjectNode } from './project-tree'
import { expectOk, parseBody } from './rpc'
import { sessionListSchema } from './schemas'
import { sessionInfoFromMeta } from './shim-session-row'

const DEFAULT_PREVIEW = 3
const MAX_PREVIEW = 2000

const projectListSchema = z.object({
  activeId: z.string().nullable(),
  projects: z.array(
    z.looseObject({ derived: z.boolean().default(false), id: z.string(), name: z.string(), path: z.string() })
  )
})

async function readTree(hub: GatewayHub, previewLimit: number) {
  const list = parseBody(projectListSchema, expectOk(await hub.caller.get(undefined, '/api/projects'), 'projects.tree'), 'projects.tree')

  const metas = parseBody(
    sessionListSchema,
    expectOk(await hub.caller.get(undefined, '/api/sessions'), 'projects.tree'),
    'projects.tree'
  ).filter(meta => !meta.trashed)

  const projects = buildProjectTree(
    list.projects.map(({ derived, id, name, path }) => ({ derived, id, name, path })),
    metas.map(sessionInfoFromMeta),
    previewLimit
  )

  return { activeId: list.activeId, projects }
}

const previewOf = (value: unknown): number =>
  typeof value === 'number' && value > 0 ? Math.min(Math.floor(value), MAX_PREVIEW) : DEFAULT_PREVIEW

/** The sidebar's project lanes: every project with its sessions, the preview kept short. */
export const projectsTree: Handler = async (hub, params) => {
  const { activeId, projects } = await readTree(hub, previewOf(params.preview_limit))

  return {
    active_id: activeId,
    projects,
    scoped_session_ids: projects.flatMap(project => project.sessionIds)
  }
}

/** One project drilled into: the same node with its full session list in the lanes. */
export const projectsProjectSessions: Handler = async (hub, params) => {
  const id = typeof params.project_id === 'string' ? params.project_id : ''
  const { projects } = await readTree(hub, MAX_PREVIEW)
  const project: ProjectNode | null = projects.find(candidate => candidate.id === id) ?? null

  return { project }
}
