import { z } from 'zod'

import type { ProfileInfo, ProfilesResponse } from '@/types/desktop'

import { APPROVAL_TIMEOUT_MS, get, post, segment, type ShimRoute, text } from './shim-core'

const profileViewSchema = z.looseObject({
  home: z.string(),
  id: z.string(),
  isDefault: z.boolean().default(false),
  model: z.string().nullable().default(null),
  name: z.string(),
  provider: z.string().nullable().default(null),
  skillCount: z.number().default(0)
})

export const profileListSchema = z.object({ profiles: z.array(profileViewSchema) })

const okSchema = z.looseObject({ files: z.array(z.string()).optional(), id: z.string().optional(), name: z.string().optional(), path: z.string().optional() })

export const toProfileInfo = (view: z.infer<typeof profileViewSchema>): ProfileInfo => ({
  has_env: false,
  is_default: view.isDefault,
  model: view.model,
  name: view.id,
  path: view.home,
  provider: view.provider,
  skill_count: view.skillCount,
  ...(view.name !== view.id ? { display_name: view.name } : {})
})

const NAME = '/api/profiles/([^/]+)'

export const profileRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ send }) =>
      ({ profiles: profileListSchema.parse(await get(send, '/api/profiles')).profiles.map(toProfileInfo) }) satisfies ProfilesResponse,
    method: 'GET',
    path: /^\/api\/profiles$/
  },
  {
    handle: async ({ body, send }) => {
      const source = text(body.clone_from).trim()
      const name = text(body.name)
      const result = okSchema.parse(
        source && source !== 'default'
          ? await post(send, '/api/profiles/clone', { name, source })
          : await post(send, '/api/profiles/create', { name })
      )

      return { name: result.id ?? name, ok: true, path: result.path ?? '' }
    },
    method: 'POST',
    path: /^\/api\/profiles$/
  },
  {
    handle: async ({ body, send }) => {
      const result = okSchema.parse(await post(send, '/api/profiles/import', { source: text(body.archive) }, APPROVAL_TIMEOUT_MS))

      return { desktop: null, name: result.id ?? result.name ?? '', ok: true, path: result.path ?? '' }
    },
    method: 'POST',
    path: /^\/api\/profiles\/import$/
  },
  {
    handle: async call => {
      const result = okSchema.parse(
        await post(call.send, '/api/profiles/rename', { name: segment(call), newName: text(call.body.new_name) })
      )

      return { name: result.id ?? segment(call), ok: true, path: result.path ?? '' }
    },
    method: 'PATCH',
    path: new RegExp(`^${NAME}$`)
  },
  {
    handle: async call => {
      const result = okSchema.parse(await post(call.send, '/api/profiles/delete', { name: segment(call) }))

      return { ok: true, path: result.path ?? '' }
    },
    method: 'DELETE',
    path: new RegExp(`^${NAME}$`)
  },
  {
    handle: call => get(call.send, `/api/profiles/soul?name=${encodeURIComponent(segment(call))}`),
    method: 'GET',
    path: new RegExp(`^${NAME}/soul$`)
  },
  {
    handle: async call => {
      await post(call.send, '/api/profiles/soul', { content: text(call.body.content), name: segment(call) })

      return { ok: true }
    },
    method: 'PUT',
    path: new RegExp(`^${NAME}/soul$`)
  },
  {
    handle: async call => {
      const result = okSchema.parse(await post(call.send, '/api/profiles/export', { name: segment(call) }))

      return { archive: result.path ?? '', ok: true }
    },
    method: 'POST',
    path: new RegExp(`^${NAME}/export$`)
  },
  {
    handle: async call => ({ command: `vanta profile switch ${segment(call)}` }),
    method: 'GET',
    path: new RegExp(`^${NAME}/setup-command$`)
  }
]
