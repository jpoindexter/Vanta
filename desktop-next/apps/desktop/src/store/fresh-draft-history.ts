import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import { draftAddress } from '../../../shared/src/vanta/draft-custody'

const PREFIX = 'vanta.desktop.freshDraftHistory:v1:'
const WINDOW_KEY = 'vanta.desktop.freshDraftWindow'
let volatileWindowId: string | undefined

/** Main is a singleton; auxiliary renderers never share its resume pointer. */
export function freshDraftWindowScope(): string {
  const query = new URLSearchParams(window.location.search)
  if (!query.has('win') && !query.has('peer') && !query.has('watch')) return 'main'
  try {
    let id = window.sessionStorage.getItem(WINDOW_KEY)
    if (!id) { id = crypto.randomUUID(); window.sessionStorage.setItem(WINDOW_KEY, id) }
    return 'window:' + id
  } catch { return 'volatile:' + (volatileWindowId ??= crypto.randomUUID()) }
}

function records(): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + freshDraftWindowScope())
    if (!raw) return {}
    if (raw.length > 256 * 1024) return null
    const rows: unknown = JSON.parse(raw)
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return null
    if (Object.values(rows).some(value => typeof value !== 'string' || !/^__new__:[a-z0-9-]{1,128}$/i.test(value))) return null
    return rows as Record<string, string>
  } catch { return null }
}

const ownerKey = (owner: DraftOwner): string => {
  const valid = draftAddress({ owner, session: '__new__' }).owner
  return JSON.stringify([valid.connectionId, valid.profile])
}

export function rememberFreshDraft(owner: DraftOwner, scope: string): void {
  if (!/^__new__:[a-z0-9-]{1,128}$/i.test(scope)) return
  const rows = records()
  if (!rows) return // Never replace a corrupt index or the draft records it references.
  try { window.localStorage.setItem(PREFIX + freshDraftWindowScope(), JSON.stringify({ ...rows, [ownerKey(owner)]: scope })) }
  catch { /* The text/attachment store retains its own authoritative failure indicator. */ }
}

export function rememberedFreshDraft(owner: DraftOwner): string | undefined {
  return records()?.[ownerKey(owner)]
}
