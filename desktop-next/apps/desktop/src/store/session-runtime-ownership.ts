import { type GatewayEvent, registryBackendScopeKey } from '@vanta/shared'

import { secondaryProfileOwnerForEvent } from './session-event-provenance'
import type { SessionOwnerScope } from './session-request-router'

type RuntimeOwnershipEvent = { connectionId?: string; profile?: string; session_id?: string }

interface RuntimeOwnershipState {
  scopes: Map<string, string>
  owners: Map<string, SessionOwnerScope>
  normalizeProfile: (profile: string) => string
}

function recordEvent(state: RuntimeOwnershipState, event: RuntimeOwnershipEvent): void {
  if (!event.session_id) {
    return
  }

  if (event.connectionId) {
    state.scopes.set(event.session_id, registryBackendScopeKey(event.connectionId, event.profile))
    state.owners.set(event.session_id, {
      connectionId: event.connectionId,
      profile: String(event.profile ?? '').trim() || 'default'
    })

    return
  }

  // Keep the original event: its non-enumerable marker proves the local
  // secondary producer. A plain wire profile is not an ownership claim.
  const profile = secondaryProfileOwnerForEvent(event as GatewayEvent)

  if (profile) {
    const profileKey = state.normalizeProfile(profile)
    state.owners.set(event.session_id, profileKey)
    state.scopes.set(event.session_id, profileKey)
  }
}

function forgetProfileOnly(state: RuntimeOwnershipState, profile: string): void {
  const retired = state.normalizeProfile(profile)

  for (const [runtimeId, owner] of state.owners) {
    if (typeof owner === 'string' && state.normalizeProfile(owner) === retired) {
      state.owners.delete(runtimeId)
      state.scopes.delete(runtimeId)
    }
  }
}

/** One event-owner ledger per session-state facade instance, not a new global
 * store. Raw lookups deliberately do not trim IDs; public facade lookups do. */
export function createSessionRuntimeOwnership(normalizeProfile: (profile: string) => string) {
  const state: RuntimeOwnershipState = { scopes: new Map(), owners: new Map(), normalizeProfile }

  return {
    record: (event: RuntimeOwnershipEvent): void => recordEvent(state, event),
    ownerForRawId: (runtimeId: string): SessionOwnerScope => state.owners.get(runtimeId),
    scopeForRawId: (runtimeId: string): string | undefined => state.scopes.get(runtimeId),
    forgetProfileOnly: (profile: string): void => forgetProfileOnly(state, profile),
    drop(runtimeId: string): void {
      state.scopes.delete(runtimeId)
      state.owners.delete(runtimeId)
    },
    clear(): void {
      state.scopes.clear()
      state.owners.clear()
    }
  }
}
