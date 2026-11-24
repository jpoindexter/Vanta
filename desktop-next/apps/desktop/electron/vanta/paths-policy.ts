import { promises as fsp } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const MAX_URL_LENGTH = 4096
export const MAX_DIALOG_TITLE = 200

/** The URL, if it is one the shell may hand to the OS browser or mail client. Never `file:`, `javascript:` or custom schemes. */
export function parseExternalUrl(raw: unknown): null | URL {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    return null
  }

  try {
    const url = new URL(raw)

    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url : null
  } catch {
    return null
  }
}

export interface PathProbe {
  stat: (target: string) => Promise<{ isDirectory: () => boolean }>
}

const realProbe: PathProbe = { stat: target => fsp.stat(target) }

/** An absolute, normalised path that exists; null otherwise. A relative or traversal-shaped value is never resolved against anything. */
export async function existingAbsolutePath(
  raw: unknown,
  probe: PathProbe = realProbe
): Promise<null | { isDirectory: boolean; path: string }> {
  if (typeof raw !== 'string' || raw.includes('\0') || !path.isAbsolute(raw)) {
    return null
  }

  const normalised = path.normalize(raw)

  try {
    return { isDirectory: (await probe.stat(normalised)).isDirectory(), path: normalised }
  } catch {
    return null
  }
}

const dialogProperty = z.enum(['openFile', 'openDirectory', 'multiSelections', 'createDirectory'])

export const selectPathsSchema = z
  .object({
    buttonLabel: z.string().max(MAX_DIALOG_TITLE).optional(),
    defaultPath: z.string().max(4096).optional(),
    properties: z.array(dialogProperty).max(4).optional(),
    title: z.string().max(MAX_DIALOG_TITLE).optional()
  })
  .strict()

export type SelectPathsOptions = z.infer<typeof selectPathsSchema>

/** Only the dialog options the renderer is allowed to set. A dialog only returns what the user picked; it reads nothing. */
export function dialogOptionsFor(raw: unknown): SelectPathsOptions {
  const parsed = selectPathsSchema.safeParse(raw ?? {})

  return parsed.success ? parsed.data : { properties: ['openFile'] }
}
