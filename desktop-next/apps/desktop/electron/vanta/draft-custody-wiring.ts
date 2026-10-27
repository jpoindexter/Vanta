import path from 'node:path'
import type { VantaTransport } from '../../../shared/src/vanta'
import { CH } from './channels'
import { createDraftCustody } from './draft-custody'
import { registerDraftCustody } from './draft-custody-handlers'
import { custodyDigest } from './draft-custody-files'
import { createProfileCustodyFence, localProfileIdentities } from './draft-custody-profile-fence'
import type { IpcLike } from './native-handlers'
import { createRequestBridge } from './request-bridge'

export function createCustodyRequestBridge({ ipc, transport, userData, home }: { ipc: IpcLike; transport: VantaTransport; userData: string; home: string }) {
  const send = (call: Parameters<VantaTransport['request']>[0]) => transport.request(call)
  const custody = createDraftCustody({
    root: path.join(userData, 'unsent-attachments-v2', custodyDigest(home)),
    profileIsActive: async profile => (await localProfileIdentities(send)).some(row => row.id === profile)
  })
  registerDraftCustody(ipc, custody)
  return createRequestBridge(transport, { closed: CH.eventsClosed, frame: CH.eventsFrame }, createProfileCustodyFence(custody, send))
}
