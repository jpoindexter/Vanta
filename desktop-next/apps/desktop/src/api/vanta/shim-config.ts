import { z } from 'zod'

import { get, post, type ShimRoute } from './shim-core'

// Settings pages read and write one nested config record. Vanta serves the settings it applies at
// `GET|POST /api/config`; a page saves a nested patch with PUT, which becomes the flat `set` Vanta takes.
// Provider keys never travel this road: they are saved through Vanta's setup flow and are never read back.

const recordSchema = z.record(z.string(), z.unknown())
const savedSchema = z.looseObject({ applied: z.array(z.string()).default([]) })

type Tree = Record<string, unknown>

const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `{ a: { b: 1 } }` -> `{ 'a.b': 1 }`. Arrays and scalars are leaves. */
export function flatten(tree: Tree, prefix = ''): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (isTree(value)) {
      Object.assign(flat, flatten(value, path))
    } else {
      flat[path] = value
    }
  }

  return flat
}

/** The settings in `patch` that Vanta serves and whose value differs from what it has now. */
export function changedSettings(current: Tree, patch: Tree): Record<string, unknown> {
  const have = flatten(current)

  return Object.fromEntries(
    Object.entries(flatten(patch)).filter(([key, value]) => key in have && JSON.stringify(have[key]) !== JSON.stringify(value))
  )
}

const KEY_NOTE = 'Vanta saves provider keys through its setup flow (Settings > Providers) and never shows them again.'

const refuse = (message: string) => async (): Promise<never> => {
  throw new Error(message)
}

export const configRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ body, send }) => {
      const patch = isTree(body.config) ? body.config : {}
      const current = recordSchema.parse(await get(send, '/api/config'))
      const set = changedSettings(current, patch)

      if (!Object.keys(set).length) {
        return { ok: true }
      }

      savedSchema.parse(await post(send, '/api/config', { set }))

      return { ok: true }
    },
    method: 'PUT',
    path: /^\/api\/config$/
  },
  { handle: refuse(`Vanta does not store this value through the config. ${KEY_NOTE}`), method: 'PUT', path: /^\/api\/env$/ },
  { handle: refuse(KEY_NOTE), method: 'DELETE', path: /^\/api\/env$/ },
  { handle: refuse(KEY_NOTE), method: 'POST', path: /^\/api\/env\/reveal$/ }
]
