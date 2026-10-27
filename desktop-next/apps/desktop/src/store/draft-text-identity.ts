import { draftAddress, type DraftOwner } from '../../../shared/src/vanta/draft-custody'

const PREFIX = '__owned_draft_text_v1__:'

/** Opaque storage identity, never a backend session ID or a routing instruction. */
export function ownedDraftTextScope(owner: DraftOwner, session: string): string {
  const address = draftAddress({ owner, session })
  return PREFIX + JSON.stringify([address.owner.connectionId, address.owner.profile, address.session])
}

export function draftTextIdentity(scope: string) {
  if (!scope.startsWith(PREFIX)) return null
  const parts = JSON.parse(scope.slice(PREFIX.length))
  if (!Array.isArray(parts) || parts.length !== 3) throw new Error('Saved draft text identity is invalid.')
  const [connectionId, profile, session] = parts
  return draftAddress({ owner: { connectionId, profile }, session })
}

export function sameDraftTextOwner(from: string, to: string): boolean {
  const source = draftTextIdentity(from), target = draftTextIdentity(to)
  if (!source || !target) return source === target
  return source.owner.connectionId === target.owner.connectionId && source.owner.profile === target.owner.profile
}
