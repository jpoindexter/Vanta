import { readJson, writeJson } from '@/lib/storage'

/** Bump when the risk wording changes: every project is then asked again. */
export const FULL_ACCESS_WARNING_VERSION = '2026-07-17.v1'
export const FULL_ACCESS_WARNING_STORAGE_KEY = 'vanta.desktop.full-access-warning.v2'

type Acknowledgements = Record<string, string>

function read(): Acknowledgements {
  const stored = readJson<unknown>(FULL_ACCESS_WARNING_STORAGE_KEY)

  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Acknowledgements) : {}
}

/** Has the user confirmed the CURRENT warning for this project? An unknown project is never acknowledged. */
export function isFullAccessAcknowledged(root: string): boolean {
  return root !== '' && read()[root] === FULL_ACCESS_WARNING_VERSION
}

export function acknowledgeFullAccess(root: string): void {
  if (root !== '') {
    writeJson(FULL_ACCESS_WARNING_STORAGE_KEY, { ...read(), [root]: FULL_ACCESS_WARNING_VERSION })
  }
}

/** Ask again next time for one project. */
export function resetFullAccessAcknowledgement(root: string): void {
  const next = read()
  delete next[root]
  writeJson(FULL_ACCESS_WARNING_STORAGE_KEY, next)
}
