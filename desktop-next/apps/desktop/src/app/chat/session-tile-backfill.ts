import { probeStoredSession } from '@/app/session/hooks/use-session-actions/utils'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { takeSessionDraft } from '@/store/composer'
import { $gatewaySwitching } from '@/store/gateway-switch'
import { $activeGatewayProfile, $gatewaySwapTarget, $profiles } from '@/store/profile'
import { $connection, $gatewayState } from '@/store/session'
import { $sessionTiles, discardSessionTile, type SessionTile } from '@/store/session-states'

import { tileBackendIdentityChanged } from './session-tile-owner'
import { tileStoredRow } from './session-tile-row'

interface BackfillState {
  restored: Set<string>
  calm: boolean
  stopped: boolean
}

function hasOnlyEmptyDrafts(tile: SessionTile): boolean {
  const owner = captureDraftCustodyOwner(tile.storedSessionId, tile.ownerRoute)
  if (!owner) return false
  const drafts = [takeSessionDraft(tile.storedSessionId, owner), takeSessionDraft(tile.storedSessionId)]
  // Legacy text may block retirement, but is never assigned to this chat's owner.
  return drafts.every(draft => draft && !draft.text.trim() && draft.attachments.length === 0)
}

function retireGoneTile(tile: SessionTile, state: BackfillState): void {
  const current = $sessionTiles.get().find(candidate => candidate.storedSessionId === tile.storedSessionId)
  if (
    !state.calm || state.stopped || !state.restored.has(tile.storedSessionId) ||
    !current || current.runtimeId || tileStoredRow(tile.storedSessionId) ||
    tileBackendIdentityChanged(tile.ownerRoute?.connectionId, $connection.get())
  ) return
  if (hasOnlyEmptyDrafts(tile)) {
    // A dead id must not sit on the reopen stack.
    discardSessionTile(tile.storedSessionId)
  }
}

function backfillTiles(lookup: typeof probeStoredSession, state: BackfillState): void {
  state.calm = !$gatewaySwitching.get() && !$gatewaySwapTarget.get()
  // Even A→B→A invalidates absence while a probe is outstanding.
  const scopes = [$connection, $activeGatewayProfile, $profiles, $gatewayState, $gatewaySwitching, $gatewaySwapTarget]
  const offScopes = scopes.map(scope => scope.listen(() => { state.calm = false }))
  const probes = $sessionTiles.get()
    .filter(tile => !tile.runtimeId && !tile.workspaceTabTitle && !tileStoredRow(tile.storedSessionId))
    .map(tile => lookup(tile.storedSessionId, tile.ownerRoute)
      .then(result => { if (result.status === 'gone') retireGoneTile(tile, state) })
      .catch(() => undefined))
  void Promise.all(probes).finally(() => offScopes.forEach(offScope => offScope()))
}

/** Fill titles for restored background tabs that never mount; retire only proven-empty dead tabs. */
export function startUnrestoredTileTitleBackfill(lookup = probeStoredSession): () => void {
  const state: BackfillState = {
    restored: new Set($sessionTiles.get().flatMap(tile => tile.runtimeId ? [] : [tile.storedSessionId])),
    calm: false,
    stopped: false
  }
  const run = () => {
    if ($gatewayState.get() !== 'open') return
    off()
    backfillTiles(lookup, state)
  }
  const off = $gatewayState.listen(run)
  run()
  return () => {
    state.stopped = true
    off()
  }
}
