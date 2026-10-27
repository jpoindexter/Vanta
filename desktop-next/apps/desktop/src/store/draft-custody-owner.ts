import { isFreshDraftScope } from './fresh-draft-scope'
import { $activeGatewayProfile, resolveNewChatOwnerRoute } from './profile'
import { $connection, getSessionOwnerHint, getSessionOwnerHints } from './session'
import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import type { SessionOwnerRoute } from './session-request-router'

type ExplicitOwner = { connectionId?: string | null; profile?: string | null; targetProfile?: string }
function activeDraftConnectionId(): string {
  const descriptor = $connection.get()
  return descriptor?.connectionId || (descriptor?.mode === 'local' ? 'local' : '')
}

function draftOwnerRoute(session: string | null | undefined, explicit: ExplicitOwner | undefined, connectionId: string, profile: string): SessionOwnerRoute | null | undefined {
  if (explicit?.connectionId) return { connectionId: explicit.connectionId, profile, targetProfile: explicit.targetProfile }
  if (session && !isFreshDraftScope(session)) {
    const scoped = getSessionOwnerHint(session, connectionId ? { connectionId, profile } : undefined)
    if (scoped) return scoped
    const recorded = getSessionOwnerHints(session)
    return recorded.length > 1 ? null : recorded[0]
  }
  return resolveNewChatOwnerRoute()
}

/** Exactly the same owner door used for session.create; never ambient-read after an await. */
export function captureDraftCustodyOwner(session: string | null | undefined, explicit?: ExplicitOwner): DraftOwner | undefined {
  const activeConnection = activeDraftConnectionId()
  const profile = explicit?.profile || $activeGatewayProfile.get()
  const route = draftOwnerRoute(session, explicit, activeConnection, profile)
  if (route === null && session && !isFreshDraftScope(session)) return undefined
  const connectionId = route?.connectionId || activeConnection
  const ownerProfile = String(route?.targetProfile || route?.profile || profile)
  if (!connectionId || !ownerProfile) return undefined
  return { connectionId, profile: ownerProfile }
}
