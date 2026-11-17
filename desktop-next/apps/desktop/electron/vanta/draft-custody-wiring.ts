import path from 'node:path'
import type { VantaTransport } from '../../../shared/src/vanta'
import { CH } from './channels'
import { createDraftCustody, type DraftCustody } from './draft-custody'
import { registerDraftCustody } from './draft-custody-handlers'
import { custodyDigest } from './draft-custody-files'
import { createProfileCustodyFence, localProfileIdentities } from './draft-custody-profile-fence'
import type { IpcLike } from './native-handlers'
import { createRequestBridge, type RequestBridge } from './request-bridge'

export type CustodyRequestBridge = RequestBridge & Pick<DraftCustody, 'prepareUpdate' | 'cancelUpdate'>

export function createCustodyRequestBridge({ ipc, transport, userData, home }: { ipc: IpcLike; transport: VantaTransport; userData: string; home: string }): CustodyRequestBridge {
  const send = (call: Parameters<VantaTransport['request']>[0]) => transport.request(call)
  const custody = createDraftCustody({
    root: path.join(userData, 'unsent-attachments-v2', custodyDigest(home)),
    profileIsActive: async profile => (await localProfileIdentities(send)).some(row => row.id === profile)
  })
  registerDraftCustody(ipc, custody)
  const bridge = createRequestBridge(transport, { closed: CH.eventsClosed, frame: CH.eventsFrame }, createProfileCustodyFence(custody, send))
  return Object.assign(bridge, { prepareUpdate: () => custody.prepareUpdate(), cancelUpdate: (lease: string) => custody.cancelUpdate(lease) })
}
