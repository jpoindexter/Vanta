import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import type { VantaConnection } from '@/global'
import { getSessionOwnerHints } from './session'
import { knownOwnerForSession } from './session-states'

const refused = () => new Error('The captured draft owner could not be proven; nothing was sent.')
const same = (route: DraftOwner & { targetProfile?: string }, expected: DraftOwner) =>
  route.connectionId === expected.connectionId && (route.targetProfile || route.profile) === expected.profile
const localDescriptorMatches = (connection: VantaConnection, expected: DraftOwner) =>
  connection.mode === 'local' && (!connection.connectionId || connection.connectionId === 'local') &&
  (connection.profile || 'default') === expected.profile
function requireUnchangedOwner(session: string, owner: string): void {
  if (knownOwnerForSession(session) !== owner || getSessionOwnerHints(session).length > 1) throw refused()
}

/** The session router also supports profile-only primaries; a missing hint is not a missing owner. */
export async function assertDraftDispatchOwner(session: string | null, expected: DraftOwner): Promise<void> {
  if (!session || getSessionOwnerHints(session).length > 1) throw refused()
  const owner = knownOwnerForSession(session)
  if (owner && typeof owner === 'object') {
    if (!same(owner, expected)) throw refused()
    return
  }
  if (typeof owner !== 'string' || expected.connectionId !== 'local' || owner !== expected.profile) throw refused()
  const connection = await window.desktopBridge.getConnection(owner)
  // Resolve the same profile door as RPC dispatch, never the foreground descriptor.
  requireUnchangedOwner(session, owner)
  if (!localDescriptorMatches(connection, expected)) throw refused()
}
