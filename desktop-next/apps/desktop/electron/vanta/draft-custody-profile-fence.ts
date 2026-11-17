import type { VantaCall, VantaResult, VantaTransport } from '../../../shared/src/vanta'
import type { DraftCustody } from './draft-custody'

interface ProfileIdentity { id: string; name: string }
export async function localProfileIdentities(send: VantaTransport['request']): Promise<ProfileIdentity[]> {
  const result = await send({ method: 'GET', path: '/api/profiles' })
  const profiles = (result.data as { profiles?: unknown })?.profiles
  if (!result.ok || !Array.isArray(profiles) || !profiles.every(value => value && typeof value.id === 'string' && typeof value.name === 'string')) throw new Error('Could not establish the complete local profile catalogue; no profile mutation was attempted.')
  return profiles.map(value => ({ id: value.id, name: value.name }))
}

/** Only the existing local archive endpoint is fenced. Display rename keeps its real ID. */
export function createProfileCustodyFence(custody: DraftCustody, send: VantaTransport['request']) {
  return async (call: VantaCall): Promise<VantaResult> => {
    if (call.method !== 'POST' || call.path.split('?')[0] !== '/api/profiles/delete') return send(call)
    const name = (call.body as { name?: unknown })?.name
    if (typeof name !== 'string' || !name.trim()) return send(call)
    const rows = await localProfileIdentities(send)
    const exact = rows.find(row => row.id === name || row.name.toLowerCase() === name.toLowerCase())
    if (!exact || exact.id === 'default') throw new Error('Could not establish an archivable profile ID; no mutation was attempted.')
    const pending = await custody.beginArchive({ connectionId: 'local', profile: exact.id })
    try {
      const result = await send(call)
      const confirmed = result.ok && (result.data as { archived?: unknown })?.archived === true
      await custody.finishArchive(pending, confirmed ? 'retired' : 'unknown')
      return result
    } catch (error) {
      // Pending is deliberately durable. Recovery reads state; never retries archive.
      await custody.finishArchive(pending, 'unknown')
      throw error
    }
  }
}
