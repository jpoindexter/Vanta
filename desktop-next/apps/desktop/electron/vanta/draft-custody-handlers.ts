import type { IpcLike } from './native-handlers'
import { CH } from './channels'
import type { DraftCustody } from './draft-custody'
import type { DraftMove, DraftSendTicket } from '../../../shared/src/vanta/draft-custody-protocol'
import type { DraftQueueStage, DraftQueueQuote, DraftQueueUpdate, DraftQueueBegin, DraftQueueFinish } from '../../../shared/src/vanta/draft-queue-custody'
import type { DraftAddress } from '../../../shared/src/vanta/draft-custody'
import type { DraftLease } from '../../../shared/src/vanta/draft-custody-protocol'

export function registerDraftCustody(ipc: IpcLike, custody: DraftCustody): void {
  ipc.handle(CH.draftOpen, (_event, address: unknown) => custody.open(address))
  ipc.handle(CH.draftRead, (_event, address: unknown, lease: unknown) => custody.read(address, lease))
  ipc.handle(CH.draftWrite, (_event, record: unknown) => custody.write(record))
  ipc.handle(CH.draftMove, (_event, request: DraftMove) => custody.move(request))
  ipc.handle(CH.draftRecover, (_event, address: unknown, lease: unknown) => custody.recover(address, lease))
  ipc.handle(CH.draftBeginSend, (_event, ticket: DraftSendTicket) => custody.beginSend(ticket))
  ipc.handle(CH.draftAssignSend, (_event, ticket: DraftSendTicket, assigned: unknown) => custody.assignSend(ticket, assigned))
  ipc.handle(CH.draftFinishSend, (_event, ticket: DraftSendTicket, outcome: 'accepted' | 'rejected' | 'restore' | 'unknown') => custody.finishSend(ticket, outcome))
  ipc.handle(CH.draftQueueStage, (_event, request: DraftQueueStage) => custody.queue.stage(request))
  ipc.handle(CH.draftQueueList, (_event, address: DraftAddress, lease: DraftLease) => custody.queue.list(address, lease))
  ipc.handle(CH.draftQueueRead, (_event, request: DraftQueueQuote) => custody.queue.read(request))
  ipc.handle(CH.draftQueueUpdate, (_event, request: DraftQueueUpdate) => custody.queue.update(request))
  ipc.handle(CH.draftQueueBegin, (_event, request: DraftQueueBegin) => custody.queue.begin(request))
  ipc.handle(CH.draftQueueFinish, (_event, request: DraftQueueFinish) => custody.queue.finish(request))
  ipc.handle(CH.draftQueueRemove, (_event, request: DraftQueueQuote) => custody.queue.remove(request))
}
