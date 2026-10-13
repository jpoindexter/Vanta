import { z } from 'zod'

import type { ActionResponse } from '@/types/hermes'

import { APPROVAL_TIMEOUT_MS, post, type ShimRoute, text } from './shim-core'

const installedSchema = z.looseObject({ name: z.string() })

/** The Hermes hub install call, answered by the Vanta registry install (one-time approval on the server). */
export const skillRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ body, send }): Promise<ActionResponse> => {
      const installed = installedSchema.parse(await post(send, '/api/skills/install', { slug: text(body.identifier).trim() }, APPROVAL_TIMEOUT_MS))

      return { name: installed.name, ok: true, pid: 0 }
    },
    method: 'POST',
    path: /^\/api\/skills\/hub\/install$/
  }
]
