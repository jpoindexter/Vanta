import { JsonRpcGatewayError } from '@hermes/shared'
import { z } from 'zod'

import type { ProjectInfo, ProjectsPayload } from '@/types/hermes'

import type { Handler, Params } from './handlers-session'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'

const MS = 1000

const entrySchema = z.looseObject({
  createdAt: z.string().default(''),
  derived: z.boolean().default(false),
  id: z.string(),
  name: z.string(),
  path: z.string()
})

const listSchema = z.object({ activeId: z.string().nullable(), projects: z.array(entrySchema) })
const createdSchema = z.looseObject({ project: entrySchema })
const activeSchema = z.looseObject({ activeId: z.string().nullable() })

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function toInfo(entry: z.infer<typeof entrySchema>): ProjectInfo {
  const added = Date.parse(entry.createdAt)

  return {
    archived: false,
    board_slug: null,
    color: null,
    created_at: Number.isNaN(added) ? 0 : added / MS,
    description: null,
    folders: [{ added_at: Number.isNaN(added) ? 0 : added / MS, is_primary: true, label: null, path: entry.path }],
    icon: null,
    id: entry.id,
    name: entry.name,
    primary_path: entry.path,
    slug: slugOf(entry.name)
  }
}

/** The folder a create request names: the primary path, else the first listed folder (string or {path}). */
function folderOf(params: Params): string | undefined {
  const primary = str(params.primary_path).trim()

  if (primary) {
    return primary
  }

  const first = Array.isArray(params.folders) ? (params.folders[0] as unknown) : undefined
  const path = typeof first === 'string' ? first : str((first as { path?: unknown } | undefined)?.path)

  return path.trim() || undefined
}

async function payload(hub: GatewayHub, what: string): Promise<ProjectsPayload> {
  const list = parseBody(listSchema, expectOk(await hub.caller.get(undefined, '/api/projects'), what), what)

  // Only named projects are listed; the folder-derived one is the sidebar's own grouping.
  return { active_id: list.activeId, projects: list.projects.filter(entry => !entry.derived).map(toInfo) }
}

export const projectsList: Handler = (hub, _params) => payload(hub, 'projects.list')

export const projectsCreate: Handler = async (hub, params) => {
  const created = parseBody(
    createdSchema,
    expectOk(
      await hub.caller.post(undefined, '/api/projects/create', { name: str(params.name), ...(folderOf(params) ? { path: folderOf(params) } : {}) }),
      'projects.create'
    ),
    'projects.create'
  )

  if (params.use === true) {
    expectOk(await hub.caller.post(undefined, '/api/projects/set-active', { id: created.project.id }), 'projects.create')
  }

  return { project: toInfo(created.project) }
}

export const projectsUpdate: Handler = async (hub, params) => {
  const id = str(params.id)

  if (!id) {
    throw new JsonRpcGatewayError('projects.update needs an id', { code: 400 })
  }

  // Colour, icon and description are not kept; only the name is.
  if (typeof params.name === 'string') {
    expectOk(await hub.caller.post(undefined, '/api/projects/rename', { id, name: params.name }), 'projects.update')
  }

  return { ok: true }
}

export const projectsDelete: Handler = async (hub, params) => {
  expectOk(await hub.caller.post(undefined, '/api/projects/delete', { id: str(params.id) }), 'projects.delete')

  return payload(hub, 'projects.delete')
}

export const projectsSetActive: Handler = async (hub, params) => {
  const id = str(params.id)

  const answer = parseBody(
    activeSchema,
    expectOk(await hub.caller.post(undefined, '/api/projects/set-active', { id: id || null }), 'projects.set_active'),
    'projects.set_active'
  )

  return { active_id: answer.activeId }
}
