import { atom } from 'nanostores'
import { persistString, storedString } from '@/lib/storage'
import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import { draftTextIdentity, ownedDraftTextScope } from './draft-text-identity'
import { freshDraftWindowScope, rememberedFreshDraft, rememberFreshDraft } from './fresh-draft-history'

export const NEW_SESSION_DRAFT_KEY = '__new__'

// Stable only for the lifetime of the current sessionless chat (#66662). The
// legacy behavior mapped every unsaved chat onto the single NEW_SESSION_DRAFT_KEY
// bucket, so a second New Chat inherited the first one's unsent text. Persisting
// the key (rather than just its text) lets a reload restore that exact fresh
// draft; starting another new chat rotates the key so abandoned unsent drafts
// cannot bleed into the next lifecycle.
const FRESH_DRAFT_STORAGE_KEY = 'vanta.desktop.freshDraftKey'

const createFreshDraftKey = (): string =>
  `__new__:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export const $freshDraftKey = atom<string>(freshDraftWindowScope() === 'main'
  ? storedString(FRESH_DRAFT_STORAGE_KEY) ?? NEW_SESSION_DRAFT_KEY : createFreshDraftKey())

export const freshDraftScope = (): string => $freshDraftKey.get()
const initializedOwners = new Set<string>()
const windowOwnerKey = (owner: DraftOwner) => JSON.stringify([freshDraftWindowScope(), owner.connectionId, owner.profile])

/** Recover an owner's existing handle once at boot, before a fresh composer accepts input. */
export function initializeFreshDraftOwner(owner: DraftOwner): string {
  const identity = windowOwnerKey(owner)
  if (initializedOwners.has(identity)) return freshDraftScope()
  initializedOwners.add(identity)
  const saved = rememberedFreshDraft(owner)
  if (saved) $freshDraftKey.set(saved)
  rememberFreshDraft(owner, freshDraftScope())
  return freshDraftScope()
}

export const rotateFreshDraftKey = (owner?: DraftOwner, restore = false): string => {
  const key = (restore && owner ? rememberedFreshDraft(owner) : undefined) ?? createFreshDraftKey()
  if (owner) initializedOwners.add(windowOwnerKey(owner))
  $freshDraftKey.set(key)
  if (freshDraftWindowScope() === 'main') persistString(FRESH_DRAFT_STORAGE_KEY, key)
  if (owner) rememberFreshDraft(owner, key)

  return key
}

// A draft key belongs to a fresh-chat lifecycle when it is the legacy shared
// bucket or one of its per-instance successors (`__new__:<uuid>`, #66662).
export const isFreshDraftScope = (key: string | null | undefined): boolean =>
  typeof key === 'string' &&
  (key === NEW_SESSION_DRAFT_KEY ||
    (key.startsWith(NEW_SESSION_DRAFT_KEY) && key.length > NEW_SESSION_DRAFT_KEY.length))

// A null/empty scope IS the current fresh-chat lifecycle — resolve it to that
// lifecycle's own key so every stash/read/migrate consumer below addresses the
// active fresh bucket instead of the shared legacy one.
export const draftKey = (scope: string | null | undefined, owner?: DraftOwner) => {
  const session = scope?.trim() || freshDraftScope()
  const captured = draftTextIdentity(session)
  if (captured) {
    if (owner && (owner.connectionId !== captured.owner.connectionId || owner.profile !== captured.owner.profile)) {
      throw new Error('Captured draft text owner changed; saved words were retained.')
    }
    return session
  }
  return owner ? ownedDraftTextScope(owner, session) : session
}
